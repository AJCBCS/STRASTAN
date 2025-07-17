var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// lambda/utils/validationUtil.js
var require_validationUtil = __commonJS({
  "lambda/utils/validationUtil.js"(exports2, module2) {
    var isValidDate = (dateString) => {
      const regex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;
      if (!regex.test(dateString)) {
        return false;
      }
      const d = new Date(dateString);
      return d instanceof Date && !isNaN(d);
    };
    var validateBody2 = (body, requiredFields2) => {
      if (!body) {
        return { isValid: false, message: "Request body is missing or empty." };
      }
      for (const field of requiredFields2) {
        if (body[field] === void 0 || body[field] === null || body[field] === "") {
          return { isValid: false, message: `Bad Request: Missing or empty required field '${field}'.` };
        }
        if (field === "dateOfBirth" && !isValidDate(body[field])) {
          return { isValid: false, message: `Bad Request: Invalid format for 'dateOfBirth'. Please use MM/DD/YYYY.` };
        }
        if (field === "effectiveDate" && !isValidDate(body[field])) {
          return { isValid: false, message: `Bad Request: Invalid format for 'effectiveDate'. Please use MM/DD/YYYY.` };
        }
      }
      return { isValid: true, message: "Validation successful." };
    };
    module2.exports = {
      validateBody: validateBody2
    };
  }
});

// lambda/personnel/dev-contractDetails/updateContractDetails.js
var { DynamoDBClient, TransactWriteItemsCommand } = require("@aws-sdk/client-dynamodb");
var { marshall } = require("@aws-sdk/util-dynamodb");
var { validateBody } = require_validationUtil();
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var tableName = process.env.PERSONNEL_TABLE_NAME;
var requiredFields = [
  "role",
  "department",
  "jobLevel",
  "contractType",
  "salaryGrade",
  "salaryPay"
];
exports.handler = async (event) => {
  const { employeeId } = event.pathParameters;
  console.log(`Request to update contract details for employee ID: ${employeeId}`);
  if (!employeeId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Employee ID is required." })
    };
  }
  try {
    const body = JSON.parse(event.body);
    const validationResult = validateBody(body, requiredFields);
    if (!validationResult.isValid) {
      console.warn("Validation failed:", validationResult.message);
      return {
        statusCode: 400,
        body: JSON.stringify({ message: validationResult.message })
      };
    }
    console.log(`Input validation passed for ${employeeId}.`);
    const updateExpressionParts = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};
    const fieldsToUpdate = {
      role: body.role,
      department: body.department,
      jobLevel: body.jobLevel,
      contractType: body.contractType,
      salaryGrade: body.salaryGrade,
      salaryPay: body.salaryPay
    };
    if (body.hasOwnProperty("allowance")) {
      fieldsToUpdate.allowance = body.allowance;
    }
    for (const [field, value] of Object.entries(fieldsToUpdate)) {
      const valueKey = `:${field}`;
      const nameKey = `#${field}`;
      updateExpressionParts.push(`${nameKey} = ${valueKey}`);
      expressionAttributeValues[valueKey] = value;
      expressionAttributeNames[nameKey] = field;
    }
    const pk = `EMPLOYEE#${employeeId}`;
    const transactionParams = {
      TransactItems: [
        {
          ConditionCheck: {
            TableName: tableName,
            Key: marshall({ PK: pk, SK: "SECTION#PERSONAL_DATA" }),
            ConditionExpression: "#status = :activeStatus",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: marshall({ ":activeStatus": "ACTIVE" })
          }
        },
        {
          Update: {
            TableName: tableName,
            Key: marshall({ PK: pk, SK: "SECTION#CONTRACT_DETAILS" }),
            UpdateExpression: `SET ${updateExpressionParts.join(", ")}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: marshall(expressionAttributeValues)
          }
        }
      ]
    };
    console.log(`Executing transaction to update contract details for ${employeeId}...`);
    await dbClient.send(new TransactWriteItemsCommand(transactionParams));
    console.log(`Successfully updated contract details for ${employeeId}.`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Contract details updated successfully." })
    };
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      console.warn(`Update failed for ${employeeId}, employee not found or not active.`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Employee not found." })
      };
    }
    console.error("Error updating contract details:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to update contract details.", error: error.message })
    };
  }
};
