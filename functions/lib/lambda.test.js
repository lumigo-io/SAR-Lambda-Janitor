const _ = require("lodash");
const AWS = require("aws-sdk");

console.log = jest.fn();

const mockListFunctions = jest.fn();
AWS.Lambda.prototype.listFunctions = mockListFunctions;

const mockListLayers = jest.fn();
AWS.Lambda.prototype.listLayers = mockListLayers;

const mockListVersionsByFunction = jest.fn();
AWS.Lambda.prototype.listVersionsByFunction = mockListVersionsByFunction;

const mockListLayerVersions = jest.fn();
AWS.Lambda.prototype.listLayerVersions = mockListLayerVersions;

const mockListAliases = jest.fn();
AWS.Lambda.prototype.listAliases = mockListAliases;

const mockGetFunctionConfiguration = jest.fn();
AWS.Lambda.prototype.getFunctionConfiguration = mockGetFunctionConfiguration;

const mockDeleteFunction = jest.fn();
AWS.Lambda.prototype.deleteFunction = mockDeleteFunction;

const mockDeleteLayerVersion = jest.fn();
AWS.Lambda.prototype.deleteLayerVersion = mockDeleteLayerVersion;

const Lambda = require("./lambda");

beforeEach(() => {
	process.env.RETRY_MIN_TIMEOUT = "100";
	process.env.RETRY_MAX_TIMEOUT = "100";
});

afterEach(() => {
	mockListFunctions.mockReset();
	mockListLayers.mockReset();
	mockListVersionsByFunction.mockReset();
	mockListLayerVersions.mockReset();
	mockListAliases.mockReset();
	mockGetFunctionConfiguration.mockReset();
	mockDeleteFunction.mockReset();
	mockDeleteLayerVersion.mockReset();
});

test("listFunctions gets all functions recursively", async () => {
	const genFunctions = n => _.range(0, n).map(() => ({
		FunctionArn: "some-arn"
	}));

	givenListFunctionsReturns(genFunctions(10), true);
	givenListFunctionsReturns(genFunctions(10), true);
	givenListFunctionsReturns(genFunctions(1));

	const functions = await Lambda.listFunctions();
	expect(functions).toHaveLength(21);
});

test("listLayers gets all layers recursively", async () => {
	const genLayers = n => _.range(0, n).map(() => ({
		LayerArn: "some-arn"
	}));

	givenListLayersReturns(genLayers(10), true);
	givenListLayersReturns(genLayers(10), true);
	givenListLayersReturns(genLayers(1));

	const layers = await Lambda.listLayers();
	expect(layers).toHaveLength(21);
});

test("listVersions gets all versions recursively (but not the $LATEST)", async () => {
	const versions = n => _.range(0, n).map(m => ({
		Version: n < 10 && m === n - 1 ? "$LATEST" : "version"
	}));

	givenListVersionsReturns(versions(10), true);
	givenListVersionsReturns(versions(10), true);
	givenListVersionsReturns(versions(2));

	const functions = await Lambda.listVersions("some-arn");
	expect(functions).toHaveLength(21);
});

test("listLayerVersions gets all versions recursively", async () => {
	const versions = n => _.range(0, n).map(m => ({
		Version: m
	}));

	givenListLayerVersionsReturns(versions(10), true);
	givenListLayerVersionsReturns(versions(10), true);
	givenListLayerVersionsReturns(versions(1));

	const layerVersions = await Lambda.listLayerVersions("some-arn");
	expect(layerVersions).toHaveLength(21);
});

test("listAliasedVersions gets all versions associated with an alias recursively", async () => {
	let offset = 0;
	const aliases = n => _.range(0, n).map(() => ({
		FunctionVersion: (offset++).toString()
	}));
  
	givenListAliasesReturns(aliases(10), true);
	givenListAliasesReturns(aliases(10), true);
	givenListAliasesReturns(aliases(1));

	const functions = await Lambda.listAliasedVersions("some-arn");
	expect(functions).toHaveLength(21);
});

test("listAliasedVersions gets additional routed versions as well", async () => {
	let offset = 0;
	const response = n => ({
		promise: () => Promise.resolve({
			Aliases: _.range(0, n).map(() => ({
				FunctionVersion: (offset++).toString(),
				RoutingConfig: {
					AdditionalVersionWeights: {
						[offset.toString()]: 0.1
					}
				}
			})),
			NextMarker: n === 10 ? "more.." : undefined
		})
	});

	mockListAliases.mockReturnValueOnce(response(1));

	const functions = await Lambda.listAliasedVersions("some-arn");
	expect(functions).toHaveLength(2);
	expect(functions).toEqual(["0", "1"]);
});

test("listLayerVersionsByFunction gets all layer versions associated with a function", async () => {
	const versions = n => _.range(0, n).map(m => ({
		Version: n < 10 && m === n - 1 ? "$LATEST" : "version"
	}));

	givenListVersionsReturns(versions(3));

	let offsetLayer = 0;
	const layers = n => _.range(0, n).map(() => ({
		Arn: "some-arn:" + (offsetLayer++).toString()
	}));

	givenGetFunctionConfigurationReturns(layers(3));
	givenGetFunctionConfigurationReturns(layers(2));
	givenGetFunctionConfigurationReturns(layers(1));

	const layerVersions = await Lambda.listLayerVersionsByFunction("some-arn");
	expect(layerVersions).toHaveLength(6);
});

test("deleteVersion does what it says on the tin", async () => {
	givenDeleteFunctionSucceeds();

	await Lambda.deleteVersion("some-arn", "some-version");
	expect(mockDeleteFunction).toBeCalledWith({
		FunctionName: "some-arn",
		Qualifier: "some-version"
	});
});


test("deleteLayerVersion does what it says on the tin", async () => {
	givenDeleteLayerVersionSucceeds();

	await Lambda.deleteLayerVersion("some-arn", "some-version");
	expect(mockDeleteLayerVersion).toBeCalledWith({
		LayerName: "some-arn",
		VersionNumber: "some-version"
	});
});

describe("error handling", () => {
	test("should retry listFunctions when it errs", async () => {
		givenListFunctionsFailsWith("ThrottlingException", "Rate Limited");
		givenListFunctionsReturns([{ FunctionArn: "some-arn" }]);

		const functions = await Lambda.listFunctions();
		expect(functions).toHaveLength(1);
		expect(mockListFunctions).toBeCalledTimes(2);
	});

	test("should retry listLayers when it errs", async () => {
		givenListLayersFailsWith("ThrottlingException", "Rate Limited");
		givenListLayersReturns([{ LayerArn: "some-arn" }]);

		const layers = await Lambda.listLayers();
		expect(layers).toHaveLength(1);
		expect(mockListLayers).toBeCalledTimes(2);
	});
  
	test("should retry listVersions when it errs", async () => {
		givenListVersionsFailsWith("ThrottlingException", "Rate Limited");
		givenListVersionsReturns([{ Version: "$LATEST" }]);

		const functions = await Lambda.listVersions("some-arn");
		expect(functions).toHaveLength(0);
		expect(mockListVersionsByFunction).toBeCalledTimes(2);
	});

	test("should retry listLayerVersions when it errs", async () => {
		givenListLayerVersionsFailsWith("ThrottlingException", "Rate Limited");
		givenListLayerVersionsReturns([{ Version: "1" }]);

		const layers = await Lambda.listLayerVersions("some-arn");
		expect(layers).toHaveLength(1);
		expect(mockListLayerVersions).toBeCalledTimes(2);
	});
  
	test("should retry listAliases when it errs", async () => {
		givenListAliasesFailsWith("ThrottlingException", "Rate Limited");
		givenListAliasesReturns([{ Alias: "$LATEST" }]);

		const functions = await Lambda.listAliasedVersions("some-arn");
		expect(functions).toHaveLength(1);
		expect(mockListAliases).toBeCalledTimes(2);
	});

	test("should retry getFunctionConfiguration when it errs", async () => {
		givenListVersionsReturns([{ Version: "$LATEST" }]);
		givenGetFunctionConfigurationFailsWith("ThrottlingException", "Rate Limited");
		givenGetFunctionConfigurationReturns([{ Arn: "some-arn:1" }]);

		const layerVersions = await Lambda.listLayerVersionsByFunction("some-arn");
		expect(layerVersions).toHaveLength(1);
		expect(mockGetFunctionConfiguration).toBeCalledTimes(2);
	});
  
	test("should retry deleteFunction when it errs", async () => {
		givenDeleteFunctionFailsWith("ThrottlingException", "Rate Limited");
		givenDeleteFunctionSucceeds();

		await Lambda.deleteVersion("some-arn", "some-version");
		expect(mockDeleteFunction).toBeCalledTimes(2);
	});

	test("should retry deleteLayerVersion when it errs", async () => {
		givenDeleteLayerVersionFailsWith("ThrottlingException", "Rate Limited");
		givenDeleteLayerVersionSucceeds();

		await Lambda.deleteLayerVersion("some-arn", "some-version");
		expect(mockDeleteLayerVersion).toBeCalledTimes(2);
	});
});

const givenListFunctionsFailsWith = (code, message, retryable = true) => {
	mockListFunctions.mockReturnValueOnce({
		promise: () => Promise.reject(new AwsError(code, message, retryable))
	});
};

const givenListFunctionsReturns = (functions, hasMore = false) => {
	mockListFunctions.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Functions: functions,
			NextMarker: hasMore ? "more.." : undefined
		})
	});
};

const givenListLayersFailsWith = (code, message, retryable =  true) => {
	mockListLayers.mockReturnValueOnce({
		promise: () => Promise.reject(new AwsError(code, message, retryable))
	});
};

const givenListLayersReturns = (layers, hasMore = false) => {
	mockListLayers.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Layers: layers,
			NextMarker: hasMore ? "more.." : undefined
		})
	});
};

const givenListVersionsFailsWith = (code, message, retryable = true) => {
	mockListVersionsByFunction.mockReturnValueOnce({
		promise: () => Promise.reject(new AwsError(code, message, retryable))
	});
};

const givenListVersionsReturns = (versions, hasMore = false) => {
	mockListVersionsByFunction.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Versions: versions,
			NextMarker: hasMore ? "more.." : undefined
		})
	});
};

const givenListLayerVersionsFailsWith = (code, message, retryable = true) => {
	mockListLayerVersions.mockReturnValueOnce({
		promise: () => Promise.reject(new AwsError(code, message, retryable))
	});
};

const givenListLayerVersionsReturns = (versions, hasMore = false) => {
	mockListLayerVersions.mockReturnValueOnce({
		promise: () => Promise.resolve({
			LayerVersions: versions,
			NextMarker: hasMore ? "more.." : undefined
		})
	});
};

const givenListAliasesFailsWith = (code, message, retryable = true) => {
	mockListAliases.mockReturnValueOnce({
		promise: () => Promise.reject(new AwsError(code, message, retryable))
	});
};

const givenListAliasesReturns = (alises, hasMore = false) => {
	mockListAliases.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Aliases: alises,
			NextMarker: hasMore ? "more.." : undefined
		})
	});
};

const givenGetFunctionConfigurationFailsWith = (code, message, retryable = true) => {
	mockGetFunctionConfiguration.mockReturnValueOnce({
		promise: () => Promise.reject(new AwsError(code, message, retryable))
	});
};

const givenGetFunctionConfigurationReturns = (layers) => {
	mockGetFunctionConfiguration.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Layers: layers
		})
	});
};

const givenDeleteFunctionFailsWith = (code, message, retryable = true) => {
	mockDeleteFunction.mockReturnValueOnce({
		promise: () => Promise.reject(new AwsError(code, message, retryable))
	});
};

const givenDeleteFunctionSucceeds = () => {
	mockDeleteFunction.mockReturnValueOnce({
		promise: () => Promise.resolve()
	});
};

const givenDeleteLayerVersionFailsWith = (code, message, retryable = true) => {
	mockDeleteLayerVersion.mockReturnValueOnce({
		promise: () => Promise.reject(new AwsError(code, message, retryable))
	});
};

const givenDeleteLayerVersionSucceeds = () => {
	mockDeleteLayerVersion.mockReturnValueOnce({
		promise: () => Promise.resolve()
	});
};

class AwsError extends Error {
	constructor (code, message, retryable) {
		super(message);

		this.code = code;
		this.retryable = retryable;
	}
}
