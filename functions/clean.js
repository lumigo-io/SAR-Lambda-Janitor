const _ = require("lodash");
const Lambda = require("./lib/lambda");
const log = require("@dazn/lambda-powertools-logger");

let functions = [];

module.exports.handler = async () => {
	await clean();

	log.debug("all done");
};

const clean = async () => {
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
