var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// lambda/utils/cryptoUtil.js
var require_cryptoUtil = __commonJS({
  "lambda/utils/cryptoUtil.js"(exports2, module2) {
    var crypto = require("crypto");
    var ALGORITHM = "aes-256-cbc";
    var SECRET_KEY = process.env.AES_SECRET_KEY;
    var IV_LENGTH = 16;
    if (!SECRET_KEY || SECRET_KEY.length !== 32) {
      throw new Error("A 32-byte AES_SECRET_KEY must be provided via environment variables.");
    }
    var keyBuffer = Buffer.from(SECRET_KEY, "utf8");
    var encrypt2 = (text) => {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");
      return `${iv.toString("hex")}:${encrypted}`;
    };
    var decrypt = (text) => {
      try {
        const textParts = text.split(":");
        const iv = Buffer.from(textParts.shift(), "hex");
        const encryptedText = textParts.join(":");
        const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
      } catch (error) {
        console.error("Decryption failed:", error);
        return null;
      }
    };
    module2.exports = {
      encrypt: encrypt2,
      decrypt
    };
  }
});

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

// lambda/personnel/dev-personalData/updatePersonalData.js
var { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
var { marshall } = require("@aws-sdk/util-dynamodb");
var { encrypt } = require_cryptoUtil();
var { validateBody } = require_validationUtil();
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var tableName = process.env.PERSONNEL_TABLE_NAME;
var requiredFields = [
  "firstName",
  "lastName",
  "nationalId",
  "dateOfBirth",
  "age",
  "gender",
  "nationality",
  "maritalStatus"
];
exports.handler = async (event) => {
  const { employeeId } = event.pathParameters;
  console.log(`Request to update personal data for employee ID: ${employeeId}`);
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
    const requiredFieldsToUpdate = {
      firstName: encrypt(body.firstName),
      lastName: encrypt(body.lastName),
      nationalId: encrypt(body.nationalId),
      dateOfBirth: body.dateOfBirth,
      age: body.age,
      gender: body.gender,
      nationality: body.nationality,
      maritalStatus: body.maritalStatus
    };
    const optionalFieldsToUpdate = {};
    if (body.hasOwnProperty("middleName")) {
      optionalFieldsToUpdate.middleName = encrypt(body.middleName);
    }
    if (body.hasOwnProperty("preferredName")) {
      optionalFieldsToUpdate.preferredName = body.preferredName;
    }
    const fieldsToUpdate = { ...requiredFieldsToUpdate, ...optionalFieldsToUpdate };
    for (const [field, value] of Object.entries(fieldsToUpdate)) {
      const valueKey = `:${field}`;
      const nameKey = `#${field}`;
      updateExpressionParts.push(`${nameKey} = ${valueKey}`);
      expressionAttributeValues[valueKey] = value;
      expressionAttributeNames[nameKey] = field;
    }
    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: marshall({
        PK: `EMPLOYEE#${employeeId}`,
        SK: "SECTION#PERSONAL_DATA"
      }),
      UpdateExpression: `SET ${updateExpressionParts.join(", ")}`,
      ConditionExpression: "#status = :activeStatus",
      ExpressionAttributeNames: { ...expressionAttributeNames, "#status": "status" },
      ExpressionAttributeValues: marshall({
        ...expressionAttributeValues,
        ":activeStatus": "ACTIVE"
      }),
      ReturnValues: "NONE"
    });
    console.log(`Executing update for personal data of employee ${employeeId}...`);
    await dbClient.send(command);
    console.log(`Successfully updated personal data for ${employeeId}.`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Personal data updated successfully." })
    };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      console.warn(`Update failed for ${employeeId}, employee not found or not active.`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Employee not found or is not active." })
      };
    }
    console.error("Error updating personal data:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to update personal data.", error: error.message })
    };
  }
};
