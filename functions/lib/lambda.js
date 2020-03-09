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

const listLayers = async () => {
	log.info("listing all available layers...");

	const loop = async (acc = [], marker) => {
		const params = {
			Marker: marker,
			MaxItems: 10
		};

		const res = await retry(
			(bail) => lambda
				.listLayers(params)
				.promise()
				.catch(bailIfErrorNotRetryable(bail)),
			getRetryConfig((err) => {
				log.warn("retrying listLayers after error...", err);
			}));
		const layers = res.Layers.map(x => x.LayerArn);
		const newAcc = acc.concat(layers);

		if (res.NextMarker) {
			return loop(newAcc, res.NextMarker);
		} else {
			// Shuffle newAcc array
			log.info(`found ${newAcc.length} layers`, { count: newAcc.length });
			return newAcc.sort(() => Math.random() - Math.random());
		}
	};

	return loop();
};

const listVersions = async (funcArn) => {
	log.debug("listing function versions...", { function: funcArn });

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

const listLayerVersions = async (layerArn) => {
	log.debug("listing layer versions...", { function: layerArn });

	const loop = async (acc = [], marker) => {
		const params = {
			LayerName: layerArn,
			Marker: marker,
			MaxItems: 20
		};

		const res = await retry(
			(bail) => lambda
				.listLayerVersions(params)
				.promise()
				.catch(bailIfErrorNotRetryable(bail)),
			getRetryConfig((err) => {
				log.warn("retrying listLayerVersions after error...", { layer: layerArn }, err);
			}));
		const versions = res.LayerVersions.map(x => x.LayerVersionArn);
		const newAcc = acc.concat(versions);

		if (res.NextMarker) {
			return loop(newAcc, res.NextMarker);
		} else {
			log.debug("found versions ", { versions: newAcc.join(",") });
			return newAcc;
		}
	};

	return loop();
};

const listAliasedVersions = async (funcArn) => {
	log.debug("listing aliased function versions...", { function: funcArn });

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

const listLayerVersionsByAlias = async (funcArn) => {
	log.debug("listing referenced layer versions by alias...", { function: funcArn });

	const params = {
		FunctionName: funcArn
	};

	const res = await retry(
		(bail) => lambda
			.getFunctionConfiguration(params)
			.promise()
			.catch(bailIfErrorNotRetryable(bail)),
		getRetryConfig((err) => {
			log.warn("retrying getFunctionConfiguration after error...", { function: funcArn }, err);
		}));
	let layerVersions = [];
	if (res.Layers) {
		layerVersions = res.Layers.map(layer => layer.Arn);
	}
	log.debug("found layer versions", {
		versions: layerVersions.join(",")
	});
	return layerVersions;
};

const listLayerVersionsByFunction = async (funcArn) => {
	log.debug("listing referenced layer versions by function...", { function: funcArn });

	const aliasedVersions = await listAliasedVersions(funcArn);

	let layerVersions = [];

	for(let aliasedVersion of aliasedVersions) {
		const aliasedVersionArn = funcArn + ":" + aliasedVersion;
		const versions = await listLayerVersionsByAlias(aliasedVersionArn);
		layerVersions = layerVersions.concat(versions);
	}

	const uniqueVersions = _.uniq(layerVersions);
	log.debug("found layer versions", {
		count: layerVersions.length,
		versions: uniqueVersions.join(",")
	});
	return uniqueVersions;
};

const deleteVersion = async (funcArn, version) => {
	log.info("deleting function version...", { function: funcArn, version });

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

const deleteLayerVersion = async (layerArn, version) => {
	log.info("deleting layer function version...", { layer: layerArn, version });

	const params = {
		LayerName: layerArn,
		VersionNumber: version
	};

	await retry(
		(bail) => lambda
			.deleteLayerVersion(params)
			.promise()
			.catch(bailIfErrorNotRetryable(bail)),
		getRetryConfig((err) => {
			log.warn("retrying deleteLayerVersion after error...", { function: layerArn, version }, err);
		}));
};

module.exports = {
	listFunctions,
	listLayers,
	listVersions,
	listLayerVersions,
	listAliasedVersions,
	listLayerVersionsByFunction,
	deleteVersion,
	deleteLayerVersion
};
