// lambda/organization/dev-orgUnit/listOrgUnit.js

const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { decrypt } = require('../../utils/cryptoUtil');

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const tableName = process.env.ORGANIZATIONAL_TABLE_NAME;

// Helper to assemble and decrypt org unit
const assembleOrgUnit = (item) => {
  return {
    unitId: item.unitId,
    departmentId: item.departmentId,
    unitName: item.unitName ? decrypt(item.unitName) : '',
    effectiveDate: item.effectiveDate || '',
    description: item.description ? decrypt(item.description) : '',
    costCenterInfo: item.costCenterInfo || '',
    createdBy: item.createdBy || '',
    createdAt: item.createdAt || '',
  };
};

exports.handler = async (event) => {
  console.log('Request to list organizational units with event:', event);
  try {
    const query = event.queryStringParameters || {};
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const nextToken = query.nextToken;

    // Scan all records
    const scanResult = await dbClient.send(new ScanCommand({ TableName: tableName }));
    const allItems = scanResult.Items ? scanResult.Items.map(unmarshall) : [];

    // Filter for org unit PKs
    const orgUnits = allItems.filter(item =>
      item.PK && item.PK.startsWith('ORG#ORG_UNIT#') && item.SK === 'METADATA'
    );

    // Filterable fields
    const filterableFields = ['departmentId', 'effectiveDate', 'costCenterInfo', 'createdBy'];
    const filtersToApply = { ...query };
    const filtered = orgUnits.filter(item => {
      return Object.entries(filtersToApply).every(([key, value]) => {
        if (!filterableFields.includes(key)) return true;
        if (item[key] === undefined || item[key] === null) return false;
        return item[key].toString().toLowerCase() === value.toString().toLowerCase();
      });
    });

    // Pagination logic
    const startIndex = nextToken ? parseInt(Buffer.from(nextToken, 'base64').toString('utf8')) : 0;
    const endIndex = startIndex + limit;
    const paginatedItems = filtered.slice(startIndex, endIndex);
    const newNextToken = endIndex < filtered.length ? Buffer.from(endIndex.toString()).toString('base64') : null;
    const results = paginatedItems.map(assembleOrgUnit);

    return {
      statusCode: 200,
      body: JSON.stringify({
        orgUnits: results,
        count: results.length,
        nextToken: newNextToken,
      }),
    };
  } catch (error) {
    console.error('Error listing org units:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to list org units', error: error.message }),
    };
  }
};
