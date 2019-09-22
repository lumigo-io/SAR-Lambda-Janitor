const AWS = require("aws-sdk");
const lambda = new AWS.Lambda();
const _ = require("lodash");
const log = require("@dazn/lambda-powertools-logger");
const retry = require("async-retry");

const bailIfErrorNotRetryable = (bail) => (error) => {
	if (!error.retryable) {
		bail(error);
	} else {
		throw error;
	}
};

const getRetryConfig = (onRetry) => (
	{
		retries: parseInt(process.env.RETRIES || "5"),
		minTimeout: parseFloat(process.env.RETRY_MIN_TIMEOUT || "5000"),
		maxTimeout: parseFloat(process.env.RETRY_MAX_TIMEOUT || "60000"),
		factor: 2,
		onRetry
	}
);

const listFunctions = async () => {
	log.info("listing all available functions...");

	const loop = async (acc = [], marker) => {
		const params = {
			Marker: marker,
			MaxItems: 10
		};

		const res = await retry(
			(bail) => lambda
				.listFunctions(params)
				.promise()
				.catch(bailIfErrorNotRetryable(bail)),
			getRetryConfig((err) => {
				log.warn("retrying listFunctions after error...", err);
			}));
		const functions = res.Functions.map(x => x.FunctionArn);
		const newAcc = acc.concat(functions);

		if (res.NextMarker) {
			return loop(newAcc, res.NextMarker);
		} else {
			// Shuffle newAcc array
			log.info(`found ${newAcc.length} functions`, { count: newAcc.length });
			return newAcc.sort(() => Math.random() - Math.random());
		}
	};

	return loop();
};

const listVersions = async (funcArn) => {
	log.debug("listing versions...", { function: funcArn });

	const loop = async (acc = [], marker) => {
		const params = {
			FunctionName: funcArn,
			Marker: marker,
			MaxItems: 20
		};

		const res = await retry(
			(bail) => lambda
				.listVersionsByFunction(params)
				.promise()
				.catch(bailIfErrorNotRetryable(bail)),
			getRetryConfig((err) => {
				log.warn("retrying listVersionsByFunction after error...", { function: funcArn }, err);
			}));
		const versions = res.Versions.map(x => x.Version).filter(x => x !== "$LATEST");
		const newAcc = acc.concat(versions);

		if (res.NextMarker) {
			return loop(newAcc, res.NextMarker);
		} else {
			log.debug("found versions [NOT $LATEST]", { versions: newAcc.join(",") });
			return newAcc;
		}
	};

	return loop();
};

const listAliasedVersions = async (funcArn) => {
	log.debug("listing aliased versions...", { function: funcArn });

	const loop = async (acc = [], marker) => {
		const params = {
			FunctionName: funcArn,
			Marker: marker,
			MaxItems: 20
		};

		const res = await retry(
			(bail) => lambda
				.listAliases(params)
				.promise()
				.catch(bailIfErrorNotRetryable(bail)),
			getRetryConfig((err) => {
				log.warn("retrying listAliases after error...", { function: funcArn }, err);
			}));
		const versions = _.flatMap(res.Aliases, alias => {
			const versions = [alias.FunctionVersion];
			if (alias.RoutingConfig) {
				const additionalVersions = Object.keys(alias.RoutingConfig.AdditionalVersionWeights);
				return versions.concat(additionalVersions);
			} else {
				return versions;
			}
		});
		const newAcc = acc.concat(versions);

		if (res.NextMarker) {
			return loop(newAcc, res.NextMarker);
		} else {
			const uniqueVersions = _.uniq(newAcc);
			log.debug("found aliased versions", { 
				count: versions.length, 
				versions: uniqueVersions.join(",") 
			});
			return uniqueVersions;
		}
	};

	return loop();
};

const deleteVersion = async (funcArn, version) => {
	log.info("deleting...", { function: funcArn, version });

	const params = {
		FunctionName: funcArn,
		Qualifier: version
	};

	await retry(
		(bail) => lambda
			.deleteFunction(params)
			.promise()
			.catch(bailIfErrorNotRetryable(bail)),
		getRetryConfig((err) => {
			log.warn("retrying deleteFunction after error...", { function: funcArn, version }, err);
		}));
};

module.exports = {
	listFunctions,
	listVersions,
	listAliasedVersions,
	deleteVersion
};
