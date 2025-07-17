// lambda/organization/dev-department/departmentAggregator.js
var { DynamoDBClient, QueryCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
var { unmarshall } = require("@aws-sdk/util-dynamodb");
var { PutItemCommand } = require("@aws-sdk/client-dynamodb");
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var PERSONNEL_TABLE = process.env.PERSONNEL_TABLE_NAME;
var ORGANIZATIONAL_TABLE = process.env.ORGANIZATIONAL_TABLE_NAME;
exports.handler = async (event) => {
  for (const record of event.Records) {
    const snsMessage = JSON.parse(record.body);
    const body = JSON.parse(snsMessage.Message);
    const { departmentId } = body;
    console.log(`Aggregating for department ID: ${departmentId}`);
    const deptResult = await dbClient.send(new GetItemCommand({
      TableName: ORGANIZATIONAL_TABLE,
      Key: {
        PK: { S: `ORG#DEPARTMENT#${departmentId}` },
        SK: { S: "METADATA" }
      }
    }));
    if (!deptResult.Item) {
      console.warn(`Department not found: ${departmentId}`);
      continue;
    }
    const department = unmarshall(deptResult.Item);
    const employeeQuery = await dbClient.send(new QueryCommand({
      TableName: PERSONNEL_TABLE,
      IndexName: "DepartmentIndex",
      // Ensure you have this GSI
      KeyConditionExpression: "departmentId = :deptId",
      ExpressionAttributeValues: {
        ":deptId": { S: departmentId }
      }
    }));
    const employees = await Promise.all(
      employeeQuery.Items.map(async (emp) => {
        const data = unmarshall(emp);
        let positionName = "Unknown";
        try {
          const posRes = await dbClient.send(new GetItemCommand({
            TableName: ORGANIZATIONAL_TABLE,
            Key: {
              PK: { S: `ORG#POSITION#${data.positionId}` },
              SK: { S: "METADATA" }
            }
          }));
          if (posRes.Item) {
            const pos = unmarshall(posRes.Item);
            positionName = pos.positionName || "Unknown";
          }
        } catch (e) {
          console.error(`Error fetching position for employee ${data.employeeId}:`, e);
        }
        return {
          employeeId: data.employeeId,
          fullName: `${data.firstName} ${data.lastName}`,
          positionId: data.positionId,
          positionName
        };
      })
    );
    const aggregatedData = {
      departmentId,
      departmentName: department.departmentName,
      employees
    };
    await dbClient.send(new PutItemCommand({
      TableName: ORGANIZATIONAL_TABLE,
      Item: {
        PK: { S: `ORG#DEPARTMENT#${departmentId}` },
        SK: { S: "ENRICHED_VIEW" },
        data: { S: JSON.stringify(aggregatedData) },
        // you can also flatten the fields
        createdAt: { S: (/* @__PURE__ */ new Date()).toISOString() }
      }
    }));
    console.log("\u2705 Aggregated Department Data:", JSON.stringify(aggregatedData, null, 2));
  }
};
