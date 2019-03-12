const Lambda = require('./lib/lambda')

const mockListFunctions = jest.fn()
Lambda.listFunctions = mockListFunctions

const mockListVersions = jest.fn()
Lambda.listVersions = mockListVersions

const mockListAliasedVersions = jest.fn()
Lambda.listAliasedVersions = mockListAliasedVersions

const mockDeleteVersion = jest.fn()
Lambda.deleteVersion = mockDeleteVersion

afterEach(() => {
  mockListFunctions.mockClear()
  mockListVersions.mockClear()
  mockListAliasedVersions.mockClear()
  mockDeleteVersion.mockClear()
})

const handler = require('./clean').handler

test('when there are no functions, it does nothing', async () => {
  mockListFunctions.mockResolvedValueOnce([])

  await handler()

  expect(mockListVersions).not.toBeCalled()
  expect(mockListAliasedVersions).not.toBeCalled()
  expect(mockDeleteVersion).not.toBeCalled()
})

test('all unaliased versions of a function is deleted', async () => {
  mockListFunctions.mockResolvedValueOnce(['a'])
  mockListVersions.mockResolvedValueOnce(['1', '2', '3'])
  mockListAliasedVersions.mockResolvedValueOnce(['2'])

  await handler()

  expect(mockDeleteVersion).toHaveBeenCalledTimes(2)
  expect(mockDeleteVersion).toBeCalledWith('a', '1')
  expect(mockDeleteVersion).toBeCalledWith('a', '3')
})

test('when there are unfinished functions from a previous run, it should carry on', async () => {
  mockListFunctions.mockResolvedValue(['a', 'b'])
  mockListVersions.mockResolvedValue(['1'])
  mockListAliasedVersions.mockResolvedValue([])
  mockDeleteVersion
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('boom!')) // throw on 'b'

  // the first invocation failed on b
  await expect(handler()).rejects.toThrow('boom!')

  expect(mockDeleteVersion).toBeCalledWith('a', '1')
  expect(mockDeleteVersion).toBeCalledWith('b', '1')

  console.log('function is retried...')

  mockDeleteVersion.mockResolvedValueOnce({})

  await handler()

  // the retry shouldn't call listFunctions again, and carry on from where it failed last time
  expect(mockListFunctions).toHaveBeenCalledTimes(1)
  expect(mockDeleteVersion).toBeCalledWith('b', '1')
})
