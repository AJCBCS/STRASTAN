// lambda/personnel/dev-employee/deleteEmployee.js
var { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
var { marshall } = require("@aws-sdk/util-dynamodb");
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var tableName = process.env.PERSONNEL_TABLE_NAME;
exports.handler = async (event) => {
  const { employeeId } = event.pathParameters;
  console.log(`Received request to archive employee ID: ${employeeId}`);
  if (!employeeId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Employee ID is required in the path." })
    };
  }
  const params = {
    TableName: tableName,
    Key: marshall({
      PK: `EMPLOYEE#${employeeId}`,
      SK: "SECTION#PERSONAL_DATA"
      // The 'status' attribute lives here
    }),
    // The UpdateExpression sets the 'status' attribute to the new value 'INACTIVE'.
    UpdateExpression: "SET #status = :inactiveStatus",
    // The ConditionExpression ensures this operation only succeeds if the current status is 'ACTIVE'.
    // This prevents archiving an already archived user or a non-existent one.
    ConditionExpression: "#status = :activeStatus",
    ExpressionAttributeNames: {
      "#status": "status"
    },
    ExpressionAttributeValues: marshall({
      ":inactiveStatus": "INACTIVE",
      ":activeStatus": "ACTIVE"
    }),
    // We don't need the old or new values back, so we set ReturnValues to NONE for efficiency.
    ReturnValues: "NONE"
  };
  try {
    console.log(`Executing update to archive employee ${employeeId}...`);
    await dbClient.send(new UpdateItemCommand(params));
    console.log(`Successfully archived employee with ID: ${employeeId}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Employee archived successfully." })
    };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      console.warn(`Attempted to archive employee ${employeeId}, but they are not active or do not exist.`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Employee not found or is already inactive." })
      };
    }
    console.error(`An error occurred while archiving employee ID ${employeeId}:`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error. Failed to archive employee.",
        error: error.message
      })
    };
  }
};
