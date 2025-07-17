// lambda/organization/dev-department/departmentAggregator.js
var { DynamoDBClient, QueryCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
var { unmarshall } = require("@aws-sdk/util-dynamodb");
var db = new DynamoDBClient({ region: process.env.AWS_REGION });
exports.handler = async (event) => {
  console.log("Received SQS event:", JSON.stringify(event));
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      const { departmentId } = JSON.parse(message.Message);
      console.log(`Processing departmentId: ${departmentId}`);
      const departmentResp = await db.send(new GetItemCommand({
        TableName: process.env.ORGANIZATIONAL_TABLE_NAME,
        Key: {
          PK: { S: `ORG#DEPARTMENT#${departmentId}` },
          SK: { S: "METADATA" }
        }
      }));
      const departmentData = departmentResp.Item ? unmarshall(departmentResp.Item) : null;
      if (!departmentData) {
        console.warn(`Department not found: ${departmentId}`);
        continue;
      }
      const employeeResp = await db.send(new QueryCommand({
        TableName: process.env.PERSONNEL_TABLE_NAME,
        IndexName: "GSI1",
        // only if using GSI; otherwise scan or prefix query
        KeyConditionExpression: "GSI1PK = :dept",
        ExpressionAttributeValues: {
          ":dept": { S: `DEPT#${departmentId}` }
        }
      }));
      const employees = employeeResp.Items.map((item) => unmarshall(item));
      console.log(`Aggregated department ${departmentId} with ${employees.length} employees.`);
    } catch (err) {
      console.error("Error processing message:", err);
    }
  }
  return { statusCode: 200 };
};
