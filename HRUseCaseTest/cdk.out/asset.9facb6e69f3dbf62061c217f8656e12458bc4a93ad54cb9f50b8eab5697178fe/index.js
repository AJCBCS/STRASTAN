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
    var encrypt = (text) => {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");
      return `${iv.toString("hex")}:${encrypted}`;
    };
    var decrypt2 = (text) => {
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
      encrypt,
      decrypt: decrypt2
    };
  }
});

// lambda/personnel/dev-employee/getEmployee.js
var { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
var { unmarshall } = require("@aws-sdk/util-dynamodb");
var { decrypt } = require_cryptoUtil();
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var tableName = process.env.PERSONNEL_TABLE_NAME;
var assembleAndDecryptEmployee = (items) => {
  if (!items || items.length === 0) {
    return null;
  }
  const combinedData = items.reduce((acc, item) => ({ ...acc, ...item }), {});
  const personalData = {
    // Required fields
    firstName: decrypt(combinedData.firstName),
    lastName: decrypt(combinedData.lastName),
    middleName: combinedData.middleName ? decrypt(combinedData.middleName) : "",
    // Plaintext optional field
    preferredName: combinedData.preferredName || "",
    // Plaintext optional field
    nationalId: decrypt(combinedData.nationalId),
    dateOfBirth: combinedData.dateOfBirth,
    age: combinedData.age,
    gender: combinedData.gender,
    nationality: combinedData.nationality,
    maritalStatus: combinedData.maritalStatus
  };
  const contactInfo = {
    // Required fields
    email: decrypt(combinedData.email),
    phone: decrypt(combinedData.phone),
    altPhone: combinedData.altPhone ? decrypt(combinedData.altPhone) : "",
    // Optional field
    address: decrypt(combinedData.address),
    city: decrypt(combinedData.city),
    state: decrypt(combinedData.state),
    postalCode: decrypt(combinedData.postalCode),
    country: decrypt(combinedData.country),
    emergencyContact: {
      name: combinedData.emergencyContactName ? decrypt(combinedData.emergencyContactName) : "",
      phone: combinedData.emergencyContactPhone ? decrypt(combinedData.emergencyContactPhone) : "",
      relationship: combinedData.emergencyContactRelationship ? decrypt(combinedData.emergencyContactRelationship) : ""
    }
  };
  const contractDetails = {
    // Required fields
    role: combinedData.role,
    department: combinedData.department,
    jobLevel: combinedData.jobLevel,
    contractType: combinedData.contractType,
    salaryGrade: combinedData.salaryGrade,
    salaryPay: combinedData.salaryPay,
    allowance: combinedData.allowance !== void 0 ? combinedData.allowance : null
    // Optional field with a null default to distinguish from a value of 0
  };
  const finalResponse = {
    employee: {
      personalData,
      contactInfo,
      contractDetails
    }
  };
  return finalResponse;
};
exports.handler = async (event) => {
  const { employeeId } = event.pathParameters;
  console.log(`Received request to get details for employee ID: ${employeeId}`);
  if (!employeeId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Employee ID is required." })
    };
  }
  const pk = `EMPLOYEE#${employeeId}`;
  const queryParams = {
    TableName: tableName,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": { S: pk }
    }
  };
  try {
    console.log(`Querying DynamoDB for employee with PK: ${pk}`);
    const { Items } = await dbClient.send(new QueryCommand(queryParams));
    if (!Items || Items.length === 0) {
      console.warn(`No records found for employee ID: ${employeeId}.`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Employee not found." })
      };
    }
    const unmarshalledItems = Items.map((item) => unmarshall(item));
    const personalDataItem = unmarshalledItems.find((item) => item.SK === "SECTION#PERSONAL_DATA");
    if (!personalDataItem || personalDataItem.status !== "ACTIVE") {
      console.warn(`Employee ID: ${employeeId} is not active or personal data is missing.`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Employee not found." })
      };
    }
    console.log(`Employee ID: ${employeeId} is active. Proceeding with data assembly.`);
    const employeeDetails = assembleAndDecryptEmployee(unmarshalledItems);
    console.log(`Successfully retrieved and decrypted data for employee ID: ${employeeId}`);
    return {
      statusCode: 200,
      body: JSON.stringify(employeeDetails)
    };
  } catch (error) {
    console.error("An error occurred while getting employee details:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error. Failed to retrieve employee details.",
        error: error.message
      })
    };
  }
};
