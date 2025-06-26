const Lambda = require("./lib/lambda");

console.log = jest.fn();

const mockListFunctions = jest.fn();
Lambda.listFunctions = mockListFunctions;

const mockListVersions = jest.fn();
Lambda.listVersions = mockListVersions;

const mockListAliasedVersions = jest.fn();
Lambda.listAliasedVersions = mockListAliasedVersions;

const mockDeleteVersion = jest.fn();
Lambda.deleteVersion = mockDeleteVersion;

afterEach(() => {
  mockListFunctions.mockClear();
  mockListVersions.mockClear();
  mockListAliasedVersions.mockClear();
  mockDeleteVersion.mockClear();
});

const requireHandler = (versionsToKeep) => {
  process.env.VERSIONS_TO_KEEP = versionsToKeep.toString();
  return require("./clean").handler;
};

test("when there are no functions, it does nothing", async () => {
  mockListFunctions.mockResolvedValueOnce([]);

  const handler = requireHandler(0);
  await handler();

  expect(mockListVersions).not.toHaveBeenCalled();
  expect(mockListAliasedVersions).not.toHaveBeenCalled();
  expect(mockDeleteVersion).not.toHaveBeenCalled();
});

test("all unaliased versions of a function is deleted", async () => {
  mockListFunctions.mockResolvedValueOnce(["a"]);
  mockListVersions.mockResolvedValueOnce(["1", "2", "3"]);
  mockListAliasedVersions.mockResolvedValueOnce(["2"]);

  const handler = requireHandler(0);
  await handler();

  expect(mockDeleteVersion).toHaveBeenCalledTimes(2);
  expect(mockDeleteVersion).toHaveBeenCalledWith("a", "1");
  expect(mockDeleteVersion).toHaveBeenCalledWith("a", "3");
});

test("when there are unfinished functions from a previous run, it should carry on", async () => {
  mockListFunctions.mockResolvedValue(["a", "b"]);
  mockListVersions.mockResolvedValue(["1"]);
  mockListAliasedVersions.mockResolvedValue([]);
  mockDeleteVersion
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error("boom!")); // throw on 'b'

  // the first invocation failed on b
  const handler = requireHandler(0);
  await expect(handler()).rejects.toThrow("boom!");

  expect(mockDeleteVersion).toHaveBeenCalledWith("a", "1");
  expect(mockDeleteVersion).toHaveBeenCalledWith("b", "1");

  console.log("function is retried...");

  mockDeleteVersion.mockResolvedValueOnce({});

  await handler();

  // the retry shouldn't call listFunctions again, and carry on from where it failed last time
  expect(mockListFunctions).toHaveBeenCalledTimes(1);
  expect(mockDeleteVersion).toHaveBeenCalledWith("b", "1");
});

test("when configured to do so, keep the most recent versions even if they are not aliased", async () => {
  mockListFunctions.mockResolvedValueOnce(["keep-versions"]);
  mockListVersions.mockResolvedValueOnce(["1", "2", "3", "4", "5"]);
  mockListAliasedVersions.mockResolvedValueOnce(["2"]);

  const handler = requireHandler(3);
  await handler();

  expect(mockDeleteVersion).toHaveBeenCalledTimes(1);
  expect(mockDeleteVersion).toHaveBeenCalledWith("keep-versions", "1");
});
