const AWS = require('./aws')
const lambda = new AWS.Lambda()

const listFunctions = async () => {
  console.log('listing all available functions...')

  const loop = async (acc = [], marker) => {
    const params = {
      Marker: marker,
      MaxItems: 10
    }

    const res = await lambda.listFunctions(params).promise()
    const functions = res.Functions.map(x => x.FunctionArn)
    const newAcc = acc.concat(functions)

    if (res.NextMarker) {
      return loop(newAcc, res.NextMarker)
    } else {
      // Shuffle newAcc array
      return newAcc.sort(() => Math.random() - Math.random())
    }
  }

  return loop()
}

const listVersions = async (funcArn) => {
  console.log(`listing versions: ${funcArn}`)

  const loop = async (acc = [], marker) => {
    const params = {
      FunctionName: funcArn,
      Marker: marker,
      MaxItems: 20
    }

    const res = await lambda.listVersionsByFunction(params).promise()
    const versions = res.Versions.map(x => x.Version).filter(x => x !== '$LATEST')
    const newAcc = acc.concat(versions)

    if (res.NextMarker) {
      return loop(newAcc, res.NextMarker)
    } else {
      console.log('found versions [NOT $LATEST]:\n', newAcc)
      return newAcc
    }
  }

  return loop()
}

const listAliasedVersions = async (funcArn) => {
  console.log(`listing aliased versions: ${funcArn}`)

  const loop = async (acc = [], marker) => {
    const params = {
      FunctionName: funcArn,
      Marker: marker,
      MaxItems: 20
    }

    const res = await lambda.listAliases(params).promise()
    const versions = res.Aliases.map(x => x.FunctionVersion)
    const newAcc = acc.concat(versions)

    if (res.NextMarker) {
      return loop(newAcc, res.NextMarker)
    } else {
      console.log('found aliased versions:\n', newAcc)
      return newAcc
    }
  }

  return loop()
}

const deleteVersion = async (funcArn, version) => {
  console.log(`deleting [${funcArn}] version [${version}]`)

  const params = {
    FunctionName: funcArn,
    Qualifier: version
  }

  await lambda.deleteFunction(params).promise()
}

module.exports = {
  listFunctions,
  listVersions,
  listAliasedVersions,
  deleteVersion
}
