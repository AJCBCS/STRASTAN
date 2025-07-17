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

// lambda/personnel/dev-contactInfo/getContactInfo.js
var { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
var { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
var { decrypt } = require_cryptoUtil();
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var tableName = process.env.PERSONNEL_TABLE_NAME;
exports.handler = async (event) => {
  const { employeeId } = event.pathParameters;
  console.log(`Request to get contact info for employee ID: ${employeeId}`);
  if (!employeeId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Employee ID is required." })
    };
  }
  const pk = `EMPLOYEE#${employeeId}`;
  try {
    const personalDataKey = { PK: pk, SK: "SECTION#PERSONAL_DATA" };
    const checkCommand = new GetItemCommand({
      TableName: tableName,
      Key: marshall(personalDataKey),
      ProjectionExpression: "#status",
      // Only fetch the status attribute for efficiency
      ExpressionAttributeNames: { "#status": "status" }
    });
    const { Item: personalDataItem } = await dbClient.send(checkCommand);
    if (!personalDataItem || unmarshall(personalDataItem).status !== "ACTIVE") {
      console.warn(`Employee ${employeeId} not found or is not active.`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Employee not found." })
      };
    }
    console.log(`Employee ${employeeId} is active. Proceeding to fetch contact info.`);
    const contactInfoKey = { PK: pk, SK: "SECTION#CONTACT_INFO" };
    const getCommand = new GetItemCommand({
      TableName: tableName,
      Key: marshall(contactInfoKey)
    });
    const { Item } = await dbClient.send(getCommand);
    if (!Item) {
      console.error(`Data inconsistency: Active employee ${employeeId} is missing contact info.`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Contact information not found for this employee." })
      };
    }
    const contactInfo = unmarshall(Item);
    const decryptedData = {
      email: decrypt(contactInfo.email),
      phone: decrypt(contactInfo.phone),
      altPhone: contactInfo.altPhone ? decrypt(contactInfo.altPhone) : "",
      address: decrypt(contactInfo.address),
      city: decrypt(contactInfo.city),
      state: decrypt(contactInfo.state),
      postalCode: decrypt(contactInfo.postalCode),
      country: decrypt(contactInfo.country),
      emergencyContact: {
        name: contactInfo.emergencyContactName ? decrypt(contactInfo.emergencyContactName) : "",
        phone: contactInfo.emergencyContactPhone ? decrypt(contactInfo.emergencyContactPhone) : "",
        relationship: contactInfo.emergencyContactRelationship ? decrypt(contactInfo.emergencyContactRelationship) : ""
      }
    };
    return {
      statusCode: 200,
      body: JSON.stringify({ contactInfo: decryptedData })
    };
  } catch (error) {
    console.error("Error getting contact info:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to retrieve contact info.", error: error.message })
    };
  }
};
