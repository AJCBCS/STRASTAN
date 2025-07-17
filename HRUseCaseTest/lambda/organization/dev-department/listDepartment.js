const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const tableName = process.env.ORGANIZATIONAL_TABLE_NAME;

exports.handler = async () => {
  try {
    const scanResult = await dbClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'begins_with(PK, :prefix) AND SK = :view',
      ExpressionAttributeValues: {
        ':prefix': { S: 'ORG#DEPARTMENT#' },
        ':view': { S: 'ENRICHED_VIEW' },
      },
    }));

    const enrichedDepartments = (scanResult.Items || []).map(item => {
      const unmarshalled = unmarshall(item);
      return JSON.parse(unmarshalled.data); // parse the stringified enriched view
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        departments: enrichedDepartments,
      }),
    };
  } catch (error) {
    console.error('Error listing enriched departments:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal server error retrieving departments',
        error: error.message,
      }),
    };
  }
};
