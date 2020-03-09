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

const mockListLayers = jest.fn();
Lambda.listLayers = mockListLayers;

const mockListLayerVersions = jest.fn();
Lambda.listLayerVersions = mockListLayerVersions;

const mockListLayerVersionsByFunction = jest.fn();
Lambda.listLayerVersionsByFunction = mockListLayerVersionsByFunction;

const mockDeleteLayerVersion = jest.fn();
Lambda.deleteLayerVersion = mockDeleteLayerVersion;

afterEach(() => {
	mockListFunctions.mockClear();
	mockListVersions.mockClear();
	mockListAliasedVersions.mockClear();
	mockDeleteVersion.mockClear();
	mockListLayers.mockClear();
	mockListLayerVersions.mockClear();
	mockListLayerVersionsByFunction.mockClear();
	mockDeleteLayerVersion.mockClear();
});

const requireHandler = (versionsToKeep, layerVersionsToKeep) => {
	process.env.VERSIONS_TO_KEEP = versionsToKeep.toString();
	process.env.LAYER_VERSIONS_TO_KEEP = layerVersionsToKeep.toString();
	return require("./clean").handler;
};

test("when there are no functions or layers, it does nothing", async () => {
	mockListFunctions.mockResolvedValueOnce([]);
	mockListFunctions.mockResolvedValueOnce([]);
	mockListLayers.mockResolvedValueOnce([]);

	const handler = requireHandler(0, 0);
	await handler();

	expect(mockListVersions).not.toBeCalled();
	expect(mockListAliasedVersions).not.toBeCalled();
	expect(mockDeleteVersion).not.toBeCalled();
	expect(mockListLayerVersions).not.toBeCalled();
	expect(mockDeleteLayerVersion).not.toBeCalled();
});

test("when there are functions but no layers, it runs ok", async () => {
	mockListFunctions.mockResolvedValueOnce(["a"]);
	mockListFunctions.mockResolvedValueOnce(["a"]);
	mockListLayerVersionsByFunction.mockResolvedValueOnce([]);
	mockListLayers.mockResolvedValueOnce([]);

	const handler = requireHandler(0, 0);
	await handler();

	expect(mockListLayerVersions).not.toBeCalled();
	expect(mockDeleteLayerVersion).not.toBeCalled();
});

test("when there are layers but no functions, it runs ok", async () => {
	mockListFunctions.mockResolvedValueOnce([]);
	mockListFunctions.mockResolvedValueOnce([]);
	mockListLayerVersionsByFunction.mockResolvedValueOnce(["some-layer:1"]);
	mockListLayers.mockResolvedValueOnce(["some-layer"]);

	const handler = requireHandler(0, 0);
	await handler();

	expect(mockListVersions).not.toBeCalled();
	expect(mockListAliasedVersions).not.toBeCalled();
	expect(mockDeleteVersion).not.toBeCalled();
});

test("all unaliased versions of a function is deleted", async () => {
	mockListFunctions.mockResolvedValueOnce(["a"]);
	mockListFunctions.mockResolvedValueOnce(["a"]);
	mockListVersions.mockResolvedValueOnce(["1", "2", "3"]);
	mockListAliasedVersions.mockResolvedValueOnce(["2"]);
	mockListLayers.mockResolvedValueOnce([]);

	const handler = requireHandler(0, 0);
	await handler();

	expect(mockDeleteVersion).toHaveBeenCalledTimes(2);
	expect(mockDeleteVersion).toBeCalledWith("a", "1");
	expect(mockDeleteVersion).toBeCalledWith("a", "3");
});

test("all unreferenced versions of a layer is deleted", async () => {
	mockListFunctions.mockResolvedValueOnce(["a"]);
	mockListFunctions.mockResolvedValueOnce(["a"]);
	mockListVersions.mockResolvedValueOnce(["1", "2", "3"]);
	mockListAliasedVersions.mockResolvedValueOnce(["2", "3"]);
	mockListLayerVersionsByFunction.mockResolvedValueOnce(["some-layer:1", "other-layer:1"]);
	mockListLayers.mockResolvedValueOnce(["some-layer", "other-layer"]);
	mockListLayerVersions.mockResolvedValueOnce(["some-layer:1", "some-layer:2"]);
	mockListLayerVersions.mockResolvedValueOnce(["other-layer:1", "other-layer:2"]);

	const handler = requireHandler(0, 0);
	await handler();

	expect(mockDeleteVersion).toHaveBeenCalledTimes(1);
	expect(mockDeleteVersion).toBeCalledWith("a", "1");
	expect(mockListVersions).toHaveBeenCalledTimes(1);
	expect(mockListAliasedVersions).toHaveBeenCalledTimes(1);
	expect(mockListLayerVersionsByFunction).toHaveBeenCalledTimes(1);
	expect(mockListLayerVersionsByFunction).toBeCalledWith("a");
	expect(mockDeleteLayerVersion).toHaveBeenCalledTimes(2);
	expect(mockDeleteLayerVersion).toBeCalledWith("some-layer", "2");
	expect(mockDeleteLayerVersion).toBeCalledWith("other-layer", "2");
});

test("when there are unfinished functions from a previous run, it should carry on", async () => {
	mockListFunctions.mockResolvedValue(["a", "b"]);
	mockListVersions.mockResolvedValue(["1"]);
	mockListAliasedVersions.mockResolvedValue([]);
	mockListLayers.mockResolvedValue([]);
	mockDeleteVersion.mockResolvedValueOnce({});
	mockDeleteVersion.mockRejectedValueOnce(new Error("boom!")); // throw on 'b'

	// the first invocation failed on b
	const handler = requireHandler(0, 0);
	await expect(handler()).rejects.toThrow("boom!");

	expect(mockDeleteVersion).toBeCalledWith("a", "1");
	expect(mockDeleteVersion).toBeCalledWith("b", "1");

	console.log("function is retried...");

	mockDeleteVersion.mockResolvedValueOnce({});

	await handler();

	// the retry shouldn't call listFunctions again, and carry on from where it failed last time
	expect(mockListFunctions).toHaveBeenCalledTimes(2);
	expect(mockDeleteVersion).toBeCalledWith("b", "1");
});

test("when there are unfinished layers from a previous run, it should carry on", async () => {
	mockListFunctions.mockResolvedValue(["a"]);
	mockListVersions.mockResolvedValue(["1"]);
	mockListAliasedVersions.mockResolvedValue(["1"]);
	mockListLayerVersionsByFunction.mockResolvedValueOnce([]);
	mockListLayers.mockResolvedValueOnce(["a", "b"]);
	mockListLayerVersions.mockResolvedValueOnce(["a:1"]);
	mockListLayerVersions.mockResolvedValueOnce(["b:1"]);
	mockDeleteLayerVersion.mockResolvedValueOnce({});
	mockDeleteLayerVersion.mockRejectedValueOnce(new Error("boom!")); // throw on 'b:1'

	// the first invocation failed on b
	const handler = requireHandler(0, 0);
	await expect(handler()).rejects.toThrow("boom!");

	expect(mockDeleteLayerVersion).toBeCalledWith("a", "1");
	expect(mockDeleteLayerVersion).toBeCalledWith("b", "1");

	console.log("function is retried...");

	mockDeleteLayerVersion.mockResolvedValueOnce({});

	await handler();

	// the retry shouldn't call listFunctions again, and carry on from where it failed last time
	expect(mockListLayerVersionsByFunction).toHaveBeenCalledTimes(2);
	expect(mockDeleteLayerVersion).toBeCalledWith("b", "1");
});

test("when configured to do so, keep the most recent versions even if they are not aliased", async () => {
	mockListFunctions.mockResolvedValueOnce(["keep-versions"]);
	mockListVersions.mockResolvedValueOnce(["1", "2", "3", "4", "5"]);
	mockListVersions.mockResolvedValueOnce(["1", "2", "3", "4", "5"]);
	mockListAliasedVersions.mockResolvedValueOnce(["2"]);
	mockListLayerVersionsByFunction.mockResolvedValue(["a:2", "b:2"]);
	mockListLayers.mockResolvedValueOnce(["a", "b"]);
	mockListLayerVersions.mockResolvedValueOnce(["a:1", "a:2", "a:3", "a:4", "a:5"]);
	mockListLayerVersions.mockResolvedValueOnce(["b:1", "b:2", "b:3", "b:4", "b:5"]);

	const handler = requireHandler(3, 3);
	await handler();

	expect(mockDeleteVersion).toHaveBeenCalledTimes(1);
	expect(mockDeleteVersion).toBeCalledWith("keep-versions", "1");
	expect(mockDeleteLayerVersion).toHaveBeenCalledTimes(2);
	expect(mockDeleteLayerVersion).toBeCalledWith("a", "1");
	expect(mockDeleteLayerVersion).toBeCalledWith("b", "1");
});
