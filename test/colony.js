'use strict';
/* globals Colony, web3 */

contract('Colony', function(accounts) {
    var mainaccount = accounts[0];
    var otheraccount = accounts[1];
    var colony;

    beforeEach(function(done) {
        Colony.new()
            .then(function(contract) {
                colony = contract;
                done();
            });
    });

    it('deployed user should be admin', function(done) {

        colony.getUserInfo.call(mainaccount).then(function(admin) {
            assert.equal(admin, true, 'First user isn\'t an admin');
        }).then(done).catch(done);
    });

    it('other user should not be admin', function(done) {

        colony.getUserInfo.call(otheraccount).then(function(admin) {
            assert.equal(admin, false, 'Other user is an admin');
        }).then(done).catch(done);
    });

    it('should allow user to make suggestion', function(done) {

        colony.makeProposal('name', 'summary').then(function() {
            return colony.getProposal.call(0);
        }).then(function(value) {
            assert.equal(value[0], 'name', 'No proposal?');
            assert.equal(value[1], 'summary', 'No proposal?');
            assert.equal(value[2], false, 'No proposal?');
            assert.equal(value[3].toNumber(), 0, 'No proposal?');
        }).then(done).catch(done);
    });

    it('should allow user to edit suggestion', function(done) {
        colony.makeProposal('name', 'summary').then(function() {
            return colony.updateProposal(0, 'nameedit', 'summary');
        }).then(function() {
            return colony.getProposal.call(0);
        }).then(function(value) {
            assert.equal(value[0], 'nameedit', 'No proposal?');
            assert.equal(value[1], 'summary', 'No proposal?');
            assert.equal(value[2], false, 'No proposal?');
            assert.equal(value[3].toNumber(), 0, 'No proposal?');
        }).then(done).catch(done);
    });

    it('should allow user to contribute ETH to suggestion', function(done) {
        colony.makeProposal('name', 'summary').then(function() {
            return colony.updateProposal(0, 'nameedit', 'summary');
        }).then(function() {
            return colony.contribute(0, {
                value: 10000
            });
        }).then(function() {
            return colony.getProposal.call(0);
        }).then(function(value) {
            assert.equal(value[0], 'nameedit', 'No proposal?');
            assert.equal(value[1], 'summary', 'No proposal?');
            assert.equal(value[2], false, 'No proposal?');
            assert.equal(value[3].toNumber(), 10000, 'No proposal?');
        }).then(done).catch(done);
    });

    it('should not allow non-admin to close suggestion', function(done) {
        var prevBalance = web3.eth.getBalance(otheraccount);
        var completeAndPayProposalFailed = false;
        colony.makeProposal('name', 'summary').then(function() {
            return colony.updateProposal(0, 'nameedit', 'summary');
        }).then(function() {
            return colony.contribute(0, {
                value: 10000
            });
        }).then(function() {
            return colony.completeAndPayProposal(0, otheraccount, {
                from: otheraccount
            });
        }).catch(function() {
            completeAndPayProposalFailed = true;
            return colony.getProposal.call(0);
        }).then(function(value) {
            assert.equal(completeAndPayProposalFailed, true,
                'The completeAndPayProposal call succeeded when it should not');
            assert.equal(value[0], 'nameedit', 'No proposal?');
            assert.equal(value[1], 'summary', 'No proposal?');
            assert.equal(value[2], false, 'No proposal?');
            assert.equal(value[3].toNumber(), 10000, 'No proposal?');
            assert.equal(web3.eth.getBalance(otheraccount).lessThan(prevBalance), true);
        }).then(done).catch(done);
    });

    it('should allow admin to close suggestion', function(done) {
        var prevBalance = web3.eth.getBalance(otheraccount);

        colony.makeProposal('name', 'summary').then(function() {
            return colony.updateProposal(0, 'nameedit', 'summary');
        }).then(function() {
            return colony.contribute(0, {
                value: 10000
            });
        }).then(function() {
            return colony.completeAndPayProposal(0, otheraccount, {
                from: mainaccount
            });
        }).then(function() {
            return colony.getProposal.call(0);
        }).then(function(value) {
            assert.equal(value[0], 'nameedit', 'No proposal?');
            assert.equal(value[1], 'summary', 'No proposal?');
            assert.equal(value[2], true, 'No proposal?');
            assert.equal(value[3].toNumber(), 10000, 'No proposal?');
            assert.equal(web3.eth.getBalance(otheraccount).minus(prevBalance).toNumber(), 10000);
        }).then(done).catch(done);
    });
});
