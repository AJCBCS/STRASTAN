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

// lambda/personnel/dev-personalData/getPersonalData.js
var { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
var { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
var { decrypt } = require_cryptoUtil();
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var tableName = process.env.PERSONNEL_TABLE_NAME;
exports.handler = async (event) => {
  const { employeeId } = event.pathParameters;
  console.log(`Request to get personal data for employee ID: ${employeeId}`);
  if (!employeeId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Employee ID is required." })
    };
  }
  const key = {
    PK: `EMPLOYEE#${employeeId}`,
    SK: "SECTION#PERSONAL_DATA"
  };
  const command = new GetItemCommand({
    TableName: tableName,
    Key: marshall(key)
  });
  try {
    const { Item } = await dbClient.send(command);
    if (!Item) {
      console.warn(`Personal data not found for employee ID: ${employeeId}.`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Personal data not found for this employee." })
      };
    }
    const personalData = unmarshall(Item);
    if (personalData.status !== "ACTIVE") {
      console.warn(`Employee ID: ${employeeId} is not active.`);
      return {
        statusCode: 404,
        // Treat inactive as not found
        body: JSON.stringify({ message: "Employee not found." })
      };
    }
    console.log(`Employee ${employeeId} is active. Decrypting personal data.`);
    const decryptedData = {
      firstName: decrypt(personalData.firstName),
      lastName: decrypt(personalData.lastName),
      middleName: personalData.middleName ? decrypt(personalData.middleName) : "",
      preferredName: personalData.preferredName || "",
      nationalId: decrypt(personalData.nationalId),
      dateOfBirth: personalData.dateOfBirth,
      age: personalData.age,
      gender: personalData.gender,
      nationality: personalData.nationality,
      maritalStatus: personalData.maritalStatus
    };
    return {
      statusCode: 200,
      body: JSON.stringify({ personalData: decryptedData })
    };
  } catch (error) {
    console.error("Error getting personal data:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to retrieve personal data.", error: error.message })
    };
  }
};
