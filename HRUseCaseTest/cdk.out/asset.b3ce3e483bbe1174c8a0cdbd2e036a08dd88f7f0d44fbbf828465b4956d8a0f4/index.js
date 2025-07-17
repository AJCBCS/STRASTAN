// lambda/organization/dev-jobClassification/getJobClassification.js
exports.handler = async (event) => {
  console.log("getJobClassification Lambda Invoked:", event);
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Gets job classification details" })
  };
};
