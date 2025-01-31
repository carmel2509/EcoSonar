const lighthouseUserFlow = require('lighthouse/lighthouse-core/fraggle-rock/api.js')
const PuppeteerHar = require('puppeteer-har')
const { clickOnElement, waitForSelectors, applyChange } = require('../utils/playSelectors')
const urlsProjectRepository = require('../dataBase/urlsProjectRepository')
const viewPortParams = require('../utils/viewportParams')

class UserJourneyService { }

UserJourneyService.prototype.playUserJourney = async function (url, browser, userJourney) {
  const page = await browser.newPage()
  await page.setViewport(viewPortParams.viewPortParams)
  // disabling cache
  await page.setCacheEnabled(false)

  // get har file
  const pptrHar = new PuppeteerHar(page)
  await pptrHar.start()
  page.setBypassCSP(true)

  // go to url
  await page.goto(url, { timeout: 0, waitUntil: 'networkidle2' })
  const steps = userJourney.steps
  const timeout = 10000
  let step; let element; let promises
  for (step of steps) {
    try {
      switch (step.type) {
        case 'navigate':
          promises = []
          promises.push(page.waitForNavigation())
          await page.goto(step.url)
          await Promise.all(promises)
          break
        case 'click':
          element = await waitForSelectors(step.selectors, page, { timeout, visible: true })
          if (step.offsetX && step.offsetY) {
            await element.click({
              offset: {
                x: step.offsetX,
                y: step.offsetY
              }
            })
          } else {
            await element.click({})
          }

          break
        case 'change':
          element = await waitForSelectors(step.selectors, page, { timeout, visible: true })
          await applyChange(step.value, element)
          break
        case 'scroll' :
          await userJourneyService.scrollUntilPercentage(page, step.distancePercentage)
          break
        default:
          break
      }
    } catch (error) {
      console.log('USER JOURNEY : An error occured when launching user flow for url ' + url + ' in step ' + step.type)
      console.log(error.message)
    }
  }
  await page.waitForNavigation()
  const harObj = await pptrHar.stop()
  return {
    page,
    harObj
  }
}

UserJourneyService.prototype.playUserFlowLighthouse = async function (url, browser, userJourney) {
  const timeout = 10000
  const targetPage = await browser.newPage()
  await targetPage.setViewport(viewPortParams.viewPortParams)
  const flow = await lighthouseUserFlow.startFlow(targetPage, { name: url })
  const steps = userJourney.steps
  let step; let element
  for (step of steps) {
    switch (step.type) {
      case 'navigate':
        await flow.navigate(step.url, {
          stepName: step.url
        })
        await targetPage.setViewport(viewPortParams.viewPortParams)
        break
      case 'click':
        element = await waitForSelectors(step.selectors, targetPage, { timeout, visible: true })
        await clickOnElement(element, step)
        break
      case 'change':
        element = await waitForSelectors(step.selectors, targetPage, { timeout, visible: true })
        await applyChange(step.value, element)
        break
      case 'scroll' :
        await userJourneyService.scrollUntilPercentage(targetPage, step.distancePercentage)
        break
      default:
        break
    }
  }
  await targetPage.waitForNavigation()
  targetPage.close()
  const lighthouseResults = await flow.createFlowResult()
  return lighthouseResults.steps[0]
}

UserJourneyService.prototype.insertUserFlow = async function (projectName, url, userFlow) {
  const urlsProject = await urlsProjectRepository.getUserFlow(projectName, url)
  if (urlsProject === null) {
    console.log('UPDATE USER FLOW - Url not found')
    throw new Error('Url not found')
  } else {
    await urlsProjectRepository.insertUserFlow(urlsProject, userFlow)
      .then(() => {
        console.log('UPDATE USER FLOW - Success')
      })
  }
}

UserJourneyService.prototype.getUserFlow = async function (projectName, url) {
  const urlsProject = await urlsProjectRepository.getUserFlow(projectName, url)
  return new Promise((resolve, reject) => {
    if (urlsProject === null || urlsProject.userFlow === undefined) {
      console.log('GET USER FLOW - Url flow not found')
      reject(new Error('The page to audit does not have any user flow saved into database.'))
    } else {
      resolve(Object.fromEntries(urlsProject.userFlow))
    }
  })
}

UserJourneyService.prototype.deleteUserFlow = async function (projectName, url) {
  const urlsProject = await urlsProjectRepository.getUserFlow(projectName, url)
  if (urlsProject === null) {
    console.log('UPDATE USER FLOW - Url not found')
    throw new Error('Url not found')
  } else {
    urlsProjectRepository.deleteUserFlow(projectName, url)
  }
}

UserJourneyService.prototype.scrollUntilPercentage = async function (page, distancePercentage) {
  console.log('AUTOSCROLL - autoscroll has started')
  await page.evaluate(async (percentage) => {
    await new Promise((resolve, _reject) => {
      let totalHeight = 0
      const distance = 100
      const scrollHeight = document.body.scrollHeight * percentage / 100
      const timer = setInterval(() => {
        window.scrollBy(0, distance)
        totalHeight += distance
        if (totalHeight >= scrollHeight) {
          clearInterval(timer)
          resolve()
        }
      }, 100)
    })
  }, distancePercentage)
  console.log('AUTOSCROLL - Autoscroll has ended ')
}

const userJourneyService = new UserJourneyService()
module.exports = userJourneyService
