// lambda/organization/dev-orgUnit/listOrgUnit.js
var { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
var { unmarshall } = require("@aws-sdk/util-dynamodb");
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var orgTable = process.env.ORGANIZATIONAL_TABLE_NAME;
exports.handler = async () => {
  try {
    const scanCommand = new ScanCommand({ TableName: orgTable });
    const result = await dbClient.send(scanCommand);
    const allItems = result.Items.map(unmarshall);
    const orgUnits = allItems.filter((item) => item.PK?.startsWith("ORG#ORGUNIT#") && item.SK === "METADATA").map((item) => ({
      unitId: item.unitId,
      effectiveDate: item.effectiveDate,
      costCenterInfo: item.costCenterInfo,
      createdBy: item.createdBy,
      createdAt: item.createdAt
      // Encrypted fields like unitName and description are intentionally excluded
    }));
    return {
      statusCode: 200,
      body: JSON.stringify({ orgUnits })
    };
  } catch (err) {
    console.error("ListOrgUnit Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to list organizational units", error: err.message })
    };
  }
};
