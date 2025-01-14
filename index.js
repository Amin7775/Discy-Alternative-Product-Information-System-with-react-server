const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://discy-b9-a11.web.app",
      "https://discy-b9-a11.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// custom middleware
const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  // console.log(token)
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.Access_Token_Secret, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

// mongodb-start

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_User}:${process.env.DB_Password}@clusterpherob9.3leb5bl.mongodb.net/?retryWrites=true&w=majority&appName=ClusterPheroB9`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = client.db("DiscyDB");
    // collections
    const userCollection = database.collection("users");
    const queriesCollection = database.collection("queries");
    const recommendationsCollection = database.collection("recommendations");

    // user related apis
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // load single user information
    app.get("/user/queryUser", async (req, res) => {
      let query = {};
      // console.log(req.query);
      if (req.query?.email) {
        query = { email: req.query?.email };
      }
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const requestedInfo = req.body;
      // checking if user already exist
      const { email } = requestedInfo;
      const existingUser = await userCollection.findOne({ email: email });
      if (existingUser) {
        return res.send({ message: "User already Exits" });
      }
      const result = await userCollection.insertOne(requestedInfo);
      res.send(result);
    });

    // user stats calculate
    app.get("/users/stats", async (req, res) => {
      // aggregate for doing calculations
      const stats = await userCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalNumberOfUsers: { $sum: 1 },
              totalNumberOfQueries: { $sum: "$totalQueries" },
              totalNumberOfRecommendations: { $sum: "$totalRecommendations" },
            },
          },
        ])
        .toArray();

      // in case stats is empty or no result found
      const [result] =
        stats.length !== 0
          ? stats
          : [
              {
                totalNumberOfUsers: 0,
                totalNumberOfQueries: 0,
                totalNumberOfRecommendations: 0,
              },
            ];

      res.send(result);
    });

    // sort users based on totalQueries
    app.get("/users/sortQuery", async (req, res) => {
      const options = {
        sort: {
          totalQueries: -1,
        },
        limit: 5,
      };
      const result = await userCollection.find({}, options).toArray();
      res.send(result);
    });
    // sort users based on total recommendations
    app.get("/users/sortRecommendations", async (req, res) => {
      const options = {
        sort: {
          totalRecommendations: -1,
        },
        limit: 5,
      };
      const result = await userCollection.find({}, options).toArray();
      res.send(result);
    });
    // user related api end

    // increment related apis - start
    // recommend user -> when a user recommends update user info
    app.patch("/users", async (req, res) => {
      const requestedInfo = req.body;
      // checking if user exist
      const { email } = requestedInfo;
      // operations
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $inc: { totalRecommendations: 1 },
      };
      // update
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });
    // query update user -> when a user adds a query,  update user info
    app.patch("/users/query", async (req, res) => {
      const requestedInfo = req.body;
      const { email } = requestedInfo;
      // operations
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $inc: { totalQueries: 1 },
      };
      // update
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });
    // query recommendations increment -> to count how many users recommended
    app.patch("/queries", async (req, res) => {
      const requestedInfo = req.body;
      const { Qid } = requestedInfo;
      const filter = { _id: new ObjectId(Qid) };
      const options = { upsert: true };
      const updateDoc = {
        $inc: { recommendationCount: 1 },
      };
      // update
      const result = await queriesCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });
    // query recommendations decrement -> to count how many users recommended
    app.patch("/queries/decrement", async (req, res) => {
      const requestedInfo = req.body;
      const { Qid } = requestedInfo;
      const filter = { _id: new ObjectId(Qid) };
      const options = { upsert: true };
      const updateDoc = {
        $inc: { recommendationCount: -1 },
      };
      // update
      const result = await queriesCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });
    // increment related apis - end

    // query related api - start

    app.get("/queries", async (req, res) => {
      const searchTerm = req.query.search || "";
      const query = {
        productName: { $regex: searchTerm, $options: "i" },
      };
      const result = await queriesCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/queries", async (req, res) => {
      const newQuery = req.body;
      const result = await queriesCollection.insertOne(newQuery);
      res.send(result);
    });

    // load queries based on email -- applied jwt
    app.get("/queries/myQueries", verifyToken, async (req, res) => {
      // jwt related
      if (req?.user?.email !== req?.query?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      // console.log(req.cookies)
      let query = {};
      if (req.query?.email) {
        query = { userEmail: req.query?.email };
      } else {
        return res.send({ message: "no data" });
      }
      const options = {
        sort: {
          _id: -1,
        },
      };
      const result = await queriesCollection.find(query, options).toArray();
      res.send(result);
    });
    // load limited queries for home
    app.get("/limitedQueries", async (req, res) => {
      const options = {
        sort: {
          _id: -1,
        },
        limit: 6,
      };
      const result = await queriesCollection.find({}, options).toArray();
      // console.log(result)
      res.send(result);
    });
    // load single query information
    app.get("/queries/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await queriesCollection.findOne(query);
      res.send(result);
    });

    // update queries
    app.patch("/queries/update/:id", async (req, res) => {
      const id = req.params.id;
      const requestedInfo = req.body;
      const {
        productName,
        productBrand,
        productImage,
        queryTitle,
        boycottingReason,
      } = requestedInfo;

      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      // console.log(requestedInfo);
      const updateDoc = {
        $set: {
          productName: productName,
          productBrand: productBrand,
          productImage: productImage,
          queryTitle: queryTitle,
          boycottingReason: boycottingReason,
        },
      };
      const result = await queriesCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    // delete
    // update queries
    app.delete("/queries/delete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await queriesCollection.deleteOne(query);
      res.send(result);
    });
    // query related api - end

    // Recommendation related api - start
    // jwt applied on this route
    app.get("/recommendations", verifyToken, async (req, res) => {
      // jwt related
      if (req?.user?.email !== req?.query?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      let query = {};
      if (req.query?.email) {
        query = { queryUserEmail: req.query?.email };
      }
      const result = await recommendationsCollection.find(query).toArray();
      res.send(result);
    });
    // my recommendation - jwt applied
    app.get(
      "/recommendations/myRecommendations",
      verifyToken,
      async (req, res) => {
        // jwt related
        if (req?.user?.email !== req?.query?.email) {
          return res.status(403).send({ message: "forbidden access" });
        }
        let query = {};
        if (req.query?.email) {
          query = { recommenderEmail: req.query?.email };
        }
        const result = await recommendationsCollection.find(query).toArray();
        res.send(result);
      }
    );

    app.post("/recommendations", async (req, res) => {
      const info = req.body;
      const result = await recommendationsCollection.insertOne(info);
      res.send(result);
    });

    // delete recommendations
    app.delete("/recommendations/delete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await recommendationsCollection.deleteOne(query);
      res.send(result);
    });

    // load based on product id
    app.get("/recommendations/:productID", async (req, res) => {
      const params = req.params;
      const query = { queryID: params.productID };
      const result = await recommendationsCollection.find(query).toArray();
      res.send(result);
    });

    // Recommendation related api - end

    // jwt related apis- start
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.Access_Token_Secret, {
        expiresIn: "2h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          secure: process.env.NODE_ENV === "production" ? true : false,
        })
        .send({ success: true });
    });
    // clear cookie when logout
    app.post("/logout", async (req, res) => {
      const user = req.body;
      res
        .clearCookie("token", {
          httpOnly: true,
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          secure: process.env.NODE_ENV === "production" ? true : false,
          maxAge: 0,
        })
        .send({ success: true });
    });
    // jwt related apis- end

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// mongodb-end

app.get("/", (req, res) => {
  res.send("Discy Server is running");
});

app.listen(port, () => {
  console.log("Running on port : ", port);
});
