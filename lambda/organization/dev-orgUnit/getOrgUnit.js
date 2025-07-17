// lambda/organization/dev-orgUnit/getOrgUnit.js

const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { decrypt } = require('../../utils/cryptoUtil');

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const tableName = process.env.ORGANIZATIONAL_TABLE_NAME;

/**
 * A helper function to assemble and decrypt the org unit data from DynamoDB item
 * into a structured object. Ensures optional fields are always present with a default empty value
 * for a consistent response shape.
 * @param {Object} item - The unmarshalled DynamoDB item.
 * @returns {Object | null} A single org unit object, or null.
 */
const assembleAndDecryptOrgUnit = (item) => {
  if (!item) {
    return null;
  }

  const orgUnit = {
    unitId: item.unitId,
    departmentId: item.departmentId,
    unitName: item.unitName ? decrypt(item.unitName) : '',
    description: item.description ? decrypt(item.description) : '',
    effectiveDate: item.effectiveDate || '',
    costCenterInfo: item.costCenterInfo || '',
    createdBy: item.createdBy || '',
    createdAt: item.createdAt || '',
  };
  return orgUnit;
};

// Main Lambda handler
exports.handler = async (event) => {
  const { unitId } = event.pathParameters;
  console.log(`Received request to get org unit ID: ${unitId}`);

  if (!unitId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Organizational Unit ID is required.' }),
    };
  }

  const pk = `ORG#ORG_UNIT#${unitId}`;
  const sk = 'METADATA';

  const getParams = {
    TableName: tableName,
    Key: {
      PK: { S: pk },
      SK: { S: sk },
    },
  };

  try {
    console.log(`Querying DynamoDB for PK: ${pk}`);
    const { Item } = await dbClient.send(new GetItemCommand(getParams));

    if (!Item) {
      console.warn(`No org unit found for ID: ${unitId}`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Organizational Unit not found.' }),
      };
    }

    const unmarshalledItem = unmarshall(Item);
    const orgUnit = assembleAndDecryptOrgUnit(unmarshalledItem);

    console.log(`Successfully retrieved org unit: ${unitId}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ orgUnit }),
    };

  } catch (error) {
    console.error('Error fetching org unit:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal Server Error. Failed to retrieve org unit.',
        error: error.message,
      }),
    };
  }
};
