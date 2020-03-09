const _ = require("lodash");
const Lambda = require("./lib/lambda");
const log = require("@dazn/lambda-powertools-logger");

let functions = [];
let layers = [];

module.exports.handler = async () => {
	await cleanFunctions();
	await cleanLayers();

	log.debug("all done");
};

const cleanFunctions = async () => {
	if (functions.length === 0) {
		functions = await Lambda.listFunctions();
	}

	// clone the functions that are left to do so that as we iterate with it we
	// can remove cleaned functions from 'functions'
	const toClean = functions.map(x => x);
	log.debug(`${toClean.length} functions to clean...`, { 
		functions: toClean, 
		count: toClean.length 
	});

	for (const func of toClean) {
		await cleanFunc(func);
		functions = functions.filter((item) => item !== func);
	}
};

const cleanFunc = async (funcArn) => {
	log.debug("cleaning...", { function: funcArn });

	const aliasedVersions = await Lambda.listAliasedVersions(funcArn);
	let versions = (await Lambda.listVersions(funcArn));
	// 242, 241, 240, ...
	versions = _.orderBy(versions, v => parseInt(v), "desc");

	const versionsToKeep = parseInt(process.env.VERSIONS_TO_KEEP || "3");

	// drop the most recent N versions
	log.debug(`keeping the most recent ${versionsToKeep} versions`);
	versions = _.drop(versions, versionsToKeep);

	for (const version of versions) {
		if (!aliasedVersions.includes(version)) {
			await Lambda.deleteVersion(funcArn, version);
		}
	}
};

const cleanLayers = async () => {
	if (layers.length === 0) {
		layers = await Lambda.listLayers();
	}
	const allFunctions = await Lambda.listFunctions();
	let versionsInUse = [];

	// clone the layers that are left to do so that as we iterate with it we
	// can remove cleaned layers from 'layers'
	const toClean = layers.map(x => x);
	log.debug(`${toClean.length} layers to clean...`, {
		layers: toClean,
		count: toClean.length
	});

	for (const func of allFunctions) {
		const layerVersions = await Lambda.listLayerVersionsByFunction(func);
		versionsInUse = versionsInUse.concat(layerVersions);
	}

	for (const layerArn of toClean) {
		await cleanLayerVersion(layerArn, versionsInUse);
		layers = layers.filter(item => item !== layerArn);
	}
};

const cleanLayerVersion = async (layerArn, versionsInUse) => {
	log.debug("cleaning...", { layer: layerArn });

	let layerVersions = await Lambda.listLayerVersions(layerArn);
	// 242, 241, 240, ...
	layerVersions = _.orderBy(layerVersions, arn => {
		let v = _.last(arn.split(":"));
		return parseInt(v);
	}, "desc");

	const layerVersionsToKeep = parseInt(process.env.LAYER_VERSIONS_TO_KEEP || "3");

	// drop the most recent N versions
	log.debug(`keeping the most recent ${layerVersionsToKeep} versions`);
	layerVersions = _.drop(layerVersions, layerVersionsToKeep);

	for (const layerVersionArn of layerVersions) {
		if (!versionsInUse.includes(layerVersionArn)) {
			const layerVersion = _.last(layerVersionArn.split(":"));
			await Lambda.deleteLayerVersion(layerArn, layerVersion);
		}
	}
};
