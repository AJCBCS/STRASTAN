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
    var validateBody2 = (body, requiredFields) => {
      if (!body) {
        return { isValid: false, message: "Request body is missing or empty." };
      }
      for (const field of requiredFields) {
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

// lambda/personnel/dev-employee/updateEmployee.js
var { DynamoDBClient, TransactWriteItemsCommand } = require("@aws-sdk/client-dynamodb");
var { marshall } = require("@aws-sdk/util-dynamodb");
var { encrypt } = require_cryptoUtil();
var { validateBody } = require_validationUtil();
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var tableName = process.env.PERSONNEL_TABLE_NAME;
var personalDataRequiredFields = [
  "firstName",
  "lastName",
  "nationalId",
  "dateOfBirth",
  "age",
  "gender",
  "nationality",
  "maritalStatus"
];
var contactInfoRequiredFields = [
  "email",
  "phone",
  "address",
  "city",
  "state",
  "postalCode",
  "country"
];
var contractDetailsRequiredFields = [
  "role",
  "department",
  "jobLevel",
  "contractType",
  "salaryGrade",
  "salaryPay"
];
exports.handler = async (event) => {
  const { employeeId } = event.pathParameters;
  console.log(`Received request to update entire record for employee ID: ${employeeId}`);
  if (!employeeId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Employee ID is required in the path." })
    };
  }
  try {
    const body = JSON.parse(event.body);
    const allRequiredFields = [
      ...personalDataRequiredFields,
      ...contactInfoRequiredFields,
      ...contractDetailsRequiredFields
    ];
    const validationResult = validateBody(body, allRequiredFields);
    if (!validationResult.isValid) {
      console.warn(`Validation failed for employee ${employeeId}:`, validationResult.message);
      return {
        statusCode: 400,
        body: JSON.stringify({ message: validationResult.message })
      };
    }
    console.log(`Input validation passed for employee ${employeeId}.`);
    const pk = `EMPLOYEE#${employeeId}`;
    const personalDataItem = {
      PK: pk,
      SK: "SECTION#PERSONAL_DATA",
      firstName: encrypt(body.firstName),
      lastName: encrypt(body.lastName),
      middleName: body.middleName ? encrypt(body.middleName) : void 0,
      preferredName: body.preferredName,
      nationalId: encrypt(body.nationalId),
      dateOfBirth: body.dateOfBirth,
      age: body.age,
      gender: body.gender,
      nationality: body.nationality,
      maritalStatus: body.maritalStatus,
      status: "ACTIVE"
      // Ensure status remains ACTIVE after update
    };
    const contactInfoItem = {
      PK: pk,
      SK: "SECTION#CONTACT_INFO",
      email: encrypt(body.email),
      phone: encrypt(body.phone),
      altPhone: body.altPhone ? encrypt(body.altPhone) : void 0,
      address: encrypt(body.address),
      city: encrypt(body.city),
      state: encrypt(body.state),
      postalCode: encrypt(body.postalCode),
      country: encrypt(body.country),
      emergencyContactName: body.emergencyContactName ? encrypt(body.emergencyContactName) : void 0,
      emergencyContactPhone: body.emergencyContactPhone ? encrypt(body.emergencyContactPhone) : void 0,
      emergencyContactRelationship: body.emergencyContactRelationship ? encrypt(body.emergencyContactRelationship) : void 0
    };
    const contractDetailsItem = {
      PK: pk,
      SK: "SECTION#CONTRACT_DETAILS",
      role: body.role,
      department: body.department,
      jobLevel: body.jobLevel,
      contractType: body.contractType,
      salaryGrade: body.salaryGrade,
      salaryPay: body.salaryPay,
      allowance: body.allowance
    };
    const marshallOptions = { removeUndefinedValues: true };
    const transactionParams = {
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: marshall(personalDataItem, marshallOptions),
            // This condition ensures we only update an existing, active employee.
            ConditionExpression: "attribute_exists(PK) AND #status = :activeStatus",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: marshall({ ":activeStatus": "ACTIVE" })
          }
        },
        // The other Put operations will replace their respective items.
        { Put: { TableName: tableName, Item: marshall(contactInfoItem, marshallOptions) } },
        { Put: { TableName: tableName, Item: marshall(contractDetailsItem, marshallOptions) } }
      ]
    };
    console.log(`Executing transaction to update employee ${employeeId}...`);
    await dbClient.send(new TransactWriteItemsCommand(transactionParams));
    console.log(`Successfully updated employee with ID: ${employeeId}`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Employee updated successfully.",
        employeeId
      })
    };
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      console.warn(`Transaction failed for employee ${employeeId}, likely because the employee does not exist or is not active.`);
      return {
        statusCode: 404,
        // Treat as "Not Found" to prevent leaking info about inactive users.
        body: JSON.stringify({ message: "Employee not found." })
      };
    }
    console.error(`An error occurred during employee update for ID ${employeeId}:`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error. Failed to update employee.",
        error: error.message
      })
    };
  }
};
