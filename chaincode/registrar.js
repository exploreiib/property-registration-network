'use strict';

const {Contract} = require('fabric-contract-api');


// Common function to read any asset ,using given input key from the network
// if asset doesn't exist on network, then error will be thrown
async function readState(ctx, id) {
	const assetBuffer = await ctx.stub.getState(id); // get the asset from chaincode state
	if (!assetBuffer || assetBuffer.length === 0) {
		throw new Error(`The asset ${id} does not exist`);
	}
	const assetString = assetBuffer.toString();
	const asset = JSON.parse(assetString);

	return asset;
}

class RegistrarContract extends Contract {
	
	constructor() {
		super('org.regnet.registrarcontract');
	}
	
	// a. Instantiate
	async instantiate(ctx) {
		console.log('Chaincode was successfully deployed.');
	}

	// 1. approveNewUser
	//The registrar initiates a transaction to register a new user on the ledger based on the request received
	async approveNewUser(ctx, name,ssn) {
		const requestKey = ctx.stub.createCompositeKey('regnet.request', [name,ssn]);
		const userKey = ctx.stub.createCompositeKey('regnet.user', [name,ssn]);

    	// Fetch User Request asset with given ID from blockchain
		const userRequest = await readState(ctx, requestKey);
		let newUserObject = {
			docType: 'User',
			name: userRequest.name,
			email: userRequest.email,
			phoneNumber:userRequest.phoneNumber,
			ssn:userRequest.ssn,
			upgradCoins:0,
			createdAt: ctx.stub.getTxTimestamp(),
			updatedAt: ctx.stub.getTxTimestamp()
		}
		// putState
		await ctx.stub.putState(userKey, Buffer.from(JSON.stringify(newUserObject)));
        return newUserObject;
	}

	// 2. viewUser
	async viewUser(ctx, name,ssn) {
		const userKey = ctx.stub.createCompositeKey('regnet.user', [name,ssn]);
		const user = await readState(ctx, userKey);
		return user;

	}
    
	// 3. approvePropertyRegistration
	//The registrar to create a new “Property” asset on the network after performing certain manual checks on the request received for property registration
	async approvePropertyRegistration(ctx, propertyId) {
		const requestKey = ctx.stub.createCompositeKey('regnet.request', [propertyId]);
		const propertyKey = ctx.stub.createCompositeKey('regnet.property', [propertyId]);

    	// Fetch Request asset with given ID from blockchain
		const propertyRequest = await readState(ctx, requestKey);

		let newPropertyObject = {
				docType: 'Property',
				propertyId: propertyId,
				owner: propertyRequest.owner,
				price:propertyRequest.price,
				status:propertyRequest.status,
				createdAt: ctx.stub.getTxTimestamp(),
				updatedAt: ctx.stub.getTxTimestamp()
		}
		// putState
		await ctx.stub.putState(propertyKey, Buffer.from(JSON.stringify(newPropertyObject)));
        return newPropertyObject;
	}

	// 4. viewProperty
	async viewProperty(ctx, propertyId) {
		const propertyKey = ctx.stub.createCompositeKey('regnet.property', [propertyId]);
        return  await readState(ctx, propertyKey);
	}

}

module.exports = RegistrarContract;
