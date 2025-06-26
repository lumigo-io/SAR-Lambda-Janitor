const _ = require("lodash");
const AWS = require("aws-sdk");

console.log = jest.fn();

const mockListFunctions = jest.fn();
AWS.Lambda.prototype.listFunctions = mockListFunctions;

const mockListVersionsByFunction = jest.fn();
AWS.Lambda.prototype.listVersionsByFunction = mockListVersionsByFunction;

const mockListAliases = jest.fn();
AWS.Lambda.prototype.listAliases = mockListAliases;

const mockDeleteFunction = jest.fn();
AWS.Lambda.prototype.deleteFunction = mockDeleteFunction;

const Lambda = require("./lambda");

beforeEach(() => {
  process.env.RETRY_MIN_TIMEOUT = "100";
  process.env.RETRY_MAX_TIMEOUT = "100";
});

afterEach(() => {
  mockListFunctions.mockReset();
  mockListVersionsByFunction.mockReset();
  mockListAliases.mockReset();
  mockDeleteFunction.mockReset();
});

test("listFunctions gets all functions recursively", async () => {
  const genFunctions = (n) =>
    _.range(0, n).map(() => ({
      FunctionArn: "some-arn",
    }));

  givenListFunctionsReturns(genFunctions(10), true);
  givenListFunctionsReturns(genFunctions(10), true);
  givenListFunctionsReturns(genFunctions(1));

  const functions = await Lambda.listFunctions();
  expect(functions).toHaveLength(21);
});

test("listVersions gets all versions recursively (but not the $LATEST)", async () => {
  const versions = (n) =>
    _.range(0, n).map((m) => ({
      Version: n < 10 && m === n - 1 ? "$LATEST" : "version",
    }));

  givenListVersionsReturns(versions(10), true);
  givenListVersionsReturns(versions(10), true);
  givenListVersionsReturns(versions(2));

  const functions = await Lambda.listVersions("some-arn");
  expect(functions).toHaveLength(21);
});

test("listAliasedVersions gets all versions associated with an alias recursively", async () => {
  let offset = 0;
  const aliases = (n) =>
    _.range(0, n).map(() => ({
      FunctionVersion: (offset++).toString(),
    }));

  givenListAliasesReturns(aliases(10), true);
  givenListAliasesReturns(aliases(10), true);
  givenListAliasesReturns(aliases(1));

  const functions = await Lambda.listAliasedVersions("some-arn");
  expect(functions).toHaveLength(21);
});

test("listAliasedVersions gets additional routed versions as well", async () => {
  let offset = 0;
  const response = (n) => ({
    promise: () =>
      Promise.resolve({
        Aliases: _.range(0, n).map(() => ({
          FunctionVersion: (offset++).toString(),
          RoutingConfig: {
            AdditionalVersionWeights: {
              [offset.toString()]: 0.1,
            },
          },
        })),
        NextMarker: n === 10 ? "more.." : undefined,
      }),
  });

  mockListAliases.mockReturnValueOnce(response(1));

  const functions = await Lambda.listAliasedVersions("some-arn");
  expect(functions).toHaveLength(2);
  expect(functions).toEqual(["0", "1"]);
});

test("deleteVersion does what it says on the tin", async () => {
  givenDeleteFunctionSucceeds();

  await Lambda.deleteVersion("some-arn", "some-version");
  expect(mockDeleteFunction).toHaveBeenCalledWith({
    FunctionName: "some-arn",
    Qualifier: "some-version",
  });
});

describe("error handling", () => {
  test("should retry listFunctions when it errs", async () => {
    givenListFunctionsFailsWith("ThrottlingException", "Rate Limited");
    givenListFunctionsReturns([{ FunctionArn: "some-arn" }]);

    const functions = await Lambda.listFunctions();
    expect(functions).toHaveLength(1);
    expect(mockListFunctions).toHaveBeenCalledTimes(2);
  });

  test("should retry listVersions when it errs", async () => {
    givenListVersionsFailsWith("ThrottlingException", "Rate Limited");
    givenListVersionsReturns([{ Version: "$LATEST" }]);

    const functions = await Lambda.listVersions("some-arn");
    expect(functions).toHaveLength(0);
    expect(mockListVersionsByFunction).toHaveBeenCalledTimes(2);
  });

  test("should retry listAliases when it errs", async () => {
    givenListAliasesFailsWith("ThrottlingException", "Rate Limited");
    givenListAliasesReturns([{ Alias: "$LATEST" }]);

    const functions = await Lambda.listAliasedVersions("some-arn");
    expect(functions).toHaveLength(1);
    expect(mockListAliases).toHaveBeenCalledTimes(2);
  });

  test("should retry deleteFunction when it errs", async () => {
    givenDeleteFunctionFailsWith("ThrottlingException", "Rate Limited");
    givenDeleteFunctionSucceeds();

    await Lambda.deleteVersion("some-arn", "some-version");
    expect(mockDeleteFunction).toHaveBeenCalledTimes(2);
  });
});

const givenListFunctionsFailsWith = (code, message, retryable = true) => {
  mockListFunctions.mockReturnValueOnce({
    promise: () => Promise.reject(new AwsError(code, message, retryable)),
  });
};

const givenListFunctionsReturns = (functions, hasMore = false) => {
  mockListFunctions.mockReturnValueOnce({
    promise: () =>
      Promise.resolve({
        Functions: functions,
        NextMarker: hasMore ? "more.." : undefined,
      }),
  });
};

const givenListVersionsFailsWith = (code, message, retryable = true) => {
  mockListVersionsByFunction.mockReturnValueOnce({
    promise: () => Promise.reject(new AwsError(code, message, retryable)),
  });
};

const givenListVersionsReturns = (versions, hasMore = false) => {
  mockListVersionsByFunction.mockReturnValueOnce({
    promise: () =>
      Promise.resolve({
        Versions: versions,
        NextMarker: hasMore ? "more.." : undefined,
      }),
  });
};

const givenListAliasesFailsWith = (code, message, retryable = true) => {
  mockListAliases.mockReturnValueOnce({
    promise: () => Promise.reject(new AwsError(code, message, retryable)),
  });
};

const givenListAliasesReturns = (alises, hasMore = false) => {
  mockListAliases.mockReturnValueOnce({
    promise: () =>
      Promise.resolve({
        Aliases: alises,
        NextMarker: hasMore ? "more.." : undefined,
      }),
  });
};

const givenDeleteFunctionFailsWith = (code, message, retryable = true) => {
  mockDeleteFunction.mockReturnValueOnce({
    promise: () => Promise.reject(new AwsError(code, message, retryable)),
  });
};

const givenDeleteFunctionSucceeds = () => {
  mockDeleteFunction.mockReturnValueOnce({
    promise: () => Promise.resolve(),
  });
};

class AwsError extends Error {
  constructor(code, message, retryable) {
    super(message);

    this.code = code;
    this.retryable = retryable;
  }
}
