const _ = require("lodash");
const AWS = require("./aws");

const mockListFunctions = jest.fn();
AWS.Lambda.prototype.listFunctions = mockListFunctions;

const mockListVersionsByFunction = jest.fn();
AWS.Lambda.prototype.listVersionsByFunction = mockListVersionsByFunction;

const mockListAliases = jest.fn();
AWS.Lambda.prototype.listAliases = mockListAliases;

const mockDeleteFunction = jest.fn();
AWS.Lambda.prototype.deleteFunction = mockDeleteFunction;

const Lambda = require("./lambda");

afterEach(() => {
	mockListFunctions.mockClear();
	mockListVersionsByFunction.mockClear();
	mockListAliases.mockClear();
	mockDeleteFunction.mockClear();
});

test("listFunctions gets all functions recursively", async () => {
	const response = n => ({
		promise: () => Promise.resolve({
			Functions: _.range(0, n).map(() => ({
				FunctionArn: "some-arn"
			})),
			NextMarker: n === 10 ? "more.." : undefined
		})
	});

	mockListFunctions.mockReturnValueOnce(response(10));
	mockListFunctions.mockReturnValueOnce(response(10));
	mockListFunctions.mockReturnValueOnce(response(1));

	const functions = await Lambda.listFunctions();
	expect(functions).toHaveLength(21);
});

test("listVersions gets all versions recursively (but not the $LATEST)", async () => {
	const response = n => ({
		promise: () => Promise.resolve({
			Versions: _.range(0, n).map(m => ({
				Version: n < 10 && m === n - 1 ? "$LATEST" : "version"
			})),
			NextMarker: n === 10 ? "more.." : undefined
		})
	});

	mockListVersionsByFunction.mockReturnValueOnce(response(10));
	mockListVersionsByFunction.mockReturnValueOnce(response(10));
	mockListVersionsByFunction.mockReturnValueOnce(response(2)); // the last is $LATEST

	const functions = await Lambda.listVersions("some-arn");
	expect(functions).toHaveLength(21);
});

test("listAliasedVersions gets all versions associated with an alias recursively", async () => {
	const response = n => ({
		promise: () => Promise.resolve({
			Aliases: _.range(0, n).map(() => ({
				FunctionVersion: "version"
			})),
			NextMarker: n === 10 ? "more.." : undefined
		})
	});

	mockListAliases.mockReturnValueOnce(response(10));
	mockListAliases.mockReturnValueOnce(response(10));
	mockListAliases.mockReturnValueOnce(response(1));

	const functions = await Lambda.listAliasedVersions("some-arn");
	expect(functions).toHaveLength(21);
});

test("deleteVersion does what it says on the tin", async () => {
	mockDeleteFunction.mockReturnValueOnce({
		promise: () => Promise.resolve()
	});

	await Lambda.deleteVersion("some-arn", "some-version");
	expect(mockDeleteFunction).toBeCalledWith({
		FunctionName: "some-arn",
		Qualifier: "some-version"
	});
});
