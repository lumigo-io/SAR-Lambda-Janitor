const Lambda = require('./lib/lambda')

let functions = []

module.exports.handler = async () => {
  await clean()

  console.log('all done')
}

const clean = async () => {
  if (functions.length === 0) {
    functions = await Lambda.listFunctions()
  }

  // clone the functions that are left to do so that as we iterate with it we
  // can remove cleaned functions from 'functions'
  const toClean = functions.map(x => x)
  console.log(`${toClean.length} functions to clean:\n`, toClean)

  for (const func of toClean) {
    await cleanFunc(func)
    functions = functions.filter((item) => item !== func)
  }
}

const cleanFunc = async (funcArn) => {
  console.log(`cleaning ${funcArn}`)

  const aliasedVersions = await Lambda.listAliasedVersions(funcArn)
  const versions = await Lambda.listVersions(funcArn)

  for (const version of versions) {
    if (!aliasedVersions.includes(version)) {
      await Lambda.deleteVersion(funcArn, version)
    }
  }
}
