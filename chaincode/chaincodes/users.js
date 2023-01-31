'use strict';

const {Contract} = require('fabric-contract-api');

//predefined list of Bank Transaction IDs
const BANK_TRANSACTIONID_LIST_MASTER={
	upg100:100,
	upg500:500,
	upg1000:1000
};

//Allowed Registration Statuses
const ALLOWED_PROPERTY_REGISTARTION_STATUS_LIST = ['registered', 'onSale'];

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

class UsersContract extends Contract {

	constructor() {
		//super('UserContractRegnet');
		super('org.regnet.usercontract');
	}

	// a. Instantiate
	async instantiate(ctx) {
		console.log('Chaincode was successfully deployed.');
	}
	
    // 1. Request New User
	// This transaction is called by the user to request the registrar to register them on the property-registration-network.
	async requestNewUser(ctx, name, email,phoneNumber,ssn) {
		const requestKey = ctx.stub.createCompositeKey('regnet.request', [name,ssn]);
		const newRequestObject = {
			docType: 'Request',
			name: name,
			email: email,
			phoneNumber:phoneNumber,
			ssn:ssn,
			createdAt: ctx.stub.getTxTimestamp(),
			updatedAt: ctx.stub.getTxTimestamp()
		}
		// putState
		await ctx.stub.putState(requestKey, Buffer.from(JSON.stringify(newRequestObject)));
		return newRequestObject;
	}
    
	// 2. rechargeAccount
	// User initiates this transaction to recharge their account with “upgradCoins.”
    async rechargeAccount(ctx,name,ssn,bankTransactionId){
		const userKey = ctx.stub.createCompositeKey('regnet.user', [name,ssn]);

		// Fetch User asset with given ID from blockchain
		const user = await readState(ctx, userKey);

		//validate, if given Bank Transaction ID is valid i.e exist on predefined list of transaction ids 
		//if doesn't exist, then stop further processing and return proper error message
		if(!(bankTransactionId in BANK_TRANSACTIONID_LIST_MASTER)){
			throw new Error(`Bank Transaction Id:${bankTransactionId} is Invalid`);
		}
        
		//update the User's upgradCoins with recharged amount of upgradCoins
		user.upgradCoins = Number(user.upgradCoins) + Number(BANK_TRANSACTIONID_LIST_MASTER[bankTransactionId]);
		user.updatedAt = ctx.stub.getTxTimestamp();
		//write the updated user asset on to the network
		return ctx.stub.putState(userKey, Buffer.from(JSON.stringify(user)));	

	}
	// 3. viewUser
	async viewUser(ctx, name,ssn) {
		const userKey = ctx.stub.createCompositeKey('regnet.user', [name,ssn]);
		const user = await readState(ctx, userKey);
		return user;
	}

	// 4. propertyRegistrationRequest
	// User should call this function to register the details of their property on the property-registration-network
	async propertyRegistrationRequest(ctx,propertyId,name,ssn,price,status){
		const ownerKey = ctx.stub.createCompositeKey('regnet.user', [name,ssn]);
		const propertyRequestKey = ctx.stub.createCompositeKey('regnet.request', [propertyId]);

		//validate if owner asset exist on n/w, if not then readState call throws error
		await readState(ctx, ownerKey);
        
		//validate if given status input holds valid value
    	//if invalid value, then stop further processing and return proper error message
		if(!status || !ALLOWED_PROPERTY_REGISTARTION_STATUS_LIST.includes(status)){
			throw new Error(`Provided registration status is Invalid!`);
		}

		const newRequestObject = {
			docType: 'Request',
			propertyId: propertyId,
			price: price,
			status:status,
			owner:ownerKey,
			createdAt: ctx.stub.getTxTimestamp(),
			updatedAt: ctx.stub.getTxTimestamp()
		}
		// putState
		await ctx.stub.putState(propertyRequestKey, Buffer.from(JSON.stringify(newRequestObject)));
		return newRequestObject;
	}

	// 5. viewProperty
	async viewProperty(ctx, propertyId) {
		const propertyKey = ctx.stub.createCompositeKey('regnet.property', [propertyId]);
        const property = await readState(ctx, propertyKey);//if property doesn't exist on n/w, readState call throws error
	    return property; 
	}
    // 6. updateProperty
	async updateProperty(ctx,propertyId,name,ssn,status){
		const propertyOwner = ctx.stub.createCompositeKey('regnet.user', [name,ssn]);
		const propertyKey = ctx.stub.createCompositeKey('regnet.property', [propertyId]);

		// Fetch Property asset with given ID from blockchain
		// readState validate, if Property exist with given propertyId on network
		//if doesn't exist, then stop further processing and throws proper error message
		const property = await readState(ctx, propertyKey);

		//validate if the user invoking the update trasnaction is the property’s owner.
        if(property.owner !== propertyOwner){
			throw new Error(`Invalid owner trying to update the property`);
		}		
		
        //validate if given status input holds valid value
    	//if invalid value, then stop further processing and return proper error message
        if(!status || !ALLOWED_PROPERTY_REGISTARTION_STATUS_LIST.includes(status)){
			throw new Error(`Provided registration status is Invalid!`);
		}

		//update the property status
		property.status = status;
		property.updatedAt = ctx.stub.getTxTimestamp();
		//write the updated property asset on to the network
		return ctx.stub.putState(propertyKey, Buffer.from(JSON.stringify(property)));	
	}


    // 7. purchaseProperty
	async purchaseProperty(ctx,propertyId,name,ssn){
		const propertyKey = ctx.stub.createCompositeKey('regnet.property', [propertyId]);
		const buyerKey = ctx.stub.createCompositeKey('regnet.user', [name,ssn]);
        
		//Fetch buyer user asset with given ID from blockchain
		const buyer = await readState(ctx, buyerKey);

		// Fetch Property asset with given ID from blockchain
		const property = await readState(ctx, propertyKey);
		const sellerKey = property.owner;
		//validate, if the user invoking the purchase property transaction is the current property’s owner.
		if(sellerKey === buyerKey){
			throw new Error(`User/buyer trying to invoke purchase transaction is the current owner of property and shoudn't allow to purchase same property`);
		}
		//checks the property’s status to verify whether it is listed for sale or not.
		if(property.status !== 'onSale'){
			throw new Error(`Property doesn't list for sale and purchase not allowed on this property`);
		}		
		//checks whether the initiator of the transaction has a sufficient account balance.
		if(buyer.upgradCoins < property.price){
			throw new Error(`User doesn't have sufficient balance to purchase property`);
		}
        
		//get the current owner record (User Asset) from network
		const seller = await readState(ctx, sellerKey);

        //An amount equal to the property’s price is deducted from the buyer’s account 
        buyer.upgradCoins = buyer.upgradCoins - property.price;
		buyer.updatedAt = ctx.stub.getTxTimestamp();
		await ctx.stub.putState(buyerKey, Buffer.from(JSON.stringify(buyer)));

		//Amount equal to the property’s price is added to the seller’s account
		seller.upgradCoins = seller.upgradCoins + property.price;
		seller.updatedAt = ctx.stub.getTxTimestamp();
		await ctx.stub.putState(sellerKey, Buffer.from(JSON.stringify(seller)));

		//transfer the property record to buyer
		property.status = 'registered';
		property.owner = buyerKey; //update ownership with buyer
		property.updatedAt = ctx.stub.getTxTimestamp();
		//write the updated user asset on to the network
		return ctx.stub.putState(propertyKey, Buffer.from(JSON.stringify(property)));	
	
	}
	
}	

module.exports = UsersContract;
