const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/habits", require("./routes/habits"));

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Habit tracker API on ${port}`);
});
