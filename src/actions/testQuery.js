import QueryTest from '../build/contracts/OraclizeQueryTest';

import store from '../store';

const contract = require('truffle-contract');

export function testQuery(querySpecs) {
  const type = 'TEST_QUERY';

  return function(dispatch) {
    dispatch({ type: `${type}_PENDING` });

    let web3 = store.getState().web3.web3Instance;

    // Double-check web3's status
    if (web3 && typeof web3 !== 'undefined') {
      // Using truffle-contract create needed contract objects and set providers
      const queryTest = contract(QueryTest);
      queryTest.setProvider(web3.currentProvider);

      // Get current ethereum wallet.
      web3.eth.getCoinbase((error, coinbase) => {
        if (error) {
          console.error(error);
          return dispatch({ type: `${type}_REJECTED`, payload: { error } });
        }

        console.log('Attempting to submit test query from ' + coinbase);
        let queryTestContractInstance;

        queryTest
          .deployed()
          .then(function(queryTestContract) {
            queryTestContractInstance = queryTestContract;
            return queryTestContractInstance.testOracleQuery(
              querySpecs.oracleDataSource,
              querySpecs.oracleQuery,
              { 
                gas: 200000, 
                from: coinbase, 
                value: web3.toWei('.006', 'ether') 
              }
            );
          })
          .then(function(queryTransactionResults) {
            let queryEventIds = queryTransactionResults.logs
              .filter(({ event }) => event === 'QueryScheduled')
              .map(log => log.args.queryIDScheduled);

            if (queryEventIds.length === 0) {
              return dispatch({ type: `${type}_REJECTED`, payload: { error: 'Could not find `QueryScheduled` event.'} });
            }
            const queryID = queryEventIds[0];

            // Listen for query completed
            queryTestContractInstance.QueryCompleted()
              .watch(function(error, result) {
                if (result.args.queryIDCompleted === queryID) {
                  console.log('attempting to retrieve results for ' + queryID);
                  queryTestContractInstance.getQueryResults.call(queryID)
                    .then(function(queryResults) {
                      dispatch({ type: `${type}_FULFILLED`, payload: queryResults });
                    })
                    .catch(err => {
                      dispatch({ type: `${type}_REJECTED`, payload: { error: err } });
                    });
                }
              });
          });
      });
    } else {
      dispatch({ type: `${type}_REJECTED`, payload: { error: 'Web3 not initialised'} });
    }
  };
}
