// lambda/organization/dev-jobClassification/listJobClassification.js
exports.handler = async (event) => {
  console.log("listJobClassification Lambda Invoked:", event);
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Lists all job classification details" })
  };
};
