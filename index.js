const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri = process.env.MONGODB_URI;

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    const database = client.db("smart-nest");
    const propertiesCollection = database.collection("properties");
    const userCollection = database.collection("user");
    const bookingCollection = database.collection("booking");
    const reviewCollection = database.collection("reviews");
    const favoriteCollection=database.collection("favorites")

    //all users
    app.get("/api/user", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //properties
    app.get("/api/properties", async (req, res) => {
      const query = {};
      if (req.query.userId) {
        query.userId = req.query.userId;
      }
      const cursor = propertiesCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/api/properties/:id", async (req, res) => {
      const { id } = req.params;
      const result = await propertiesCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.post("/api/properties", async (req, res) => {
      const property = req.body;
      const newProperty = {
        ...property,
        createdAt: new Date(),
      };
      const result = await propertiesCollection.insertOne(newProperty);
      res.send(result);
    });

    app.patch("/api/properties/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updatedData,
      };

      const result = await propertiesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/api/properties/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await propertiesCollection.deleteOne(query);
      res.send(result);
    });

    //booking
    app.get("/api/bookings", async (req, res) => {
      const query = {};
      if (req.query.tenantId) {
        query.tenantId = req.query.tenantId;
      }

      if (req.query.ownerId) {
        query.ownerId = req.query.ownerId;
      }
      const cursor = bookingCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/api/bookings", async (req, res) => {
      const {
        sessionId,
        tenantId,
        tenantEmail,
        propertyId,
        title,
        price,
        location,
        rentType,
        tenantFullName,
        moveInDate,
        contactNumber,
        additionalNotes,
        BookingStatus,
        ownerId,
        ownerName,
        ownerEmail,
        image
      } = req.body;
      const isExist = await bookingCollection.findOne({ sessionId });
      if (isExist) {
        return res.json({ msg: "Already Exists!" });
      }
      await bookingCollection.insertOne({
        sessionId,
        tenantId,
        tenantEmail,
        propertyId,
        title,
        price,
        location,
        rentType,
        tenantFullName,
        moveInDate,
        contactNumber,
        additionalNotes,
        BookingStatus,
        ownerId,
        ownerName,
        ownerEmail,
        image
      });
      res.json({ msg: "Payment Successful" });
    });

    //reviews
    app.post("/api/reviews", async (req, res) => {
      try {
        const review = req.body;
        const updatedReview = {
          ...review,
          createdAt: new Date(),
        };

        const result = await reviewCollection.insertOne(updatedReview);

        res.status(201).json({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to add review" });
      }
    });


    //favorites
    app.post("/api/favorites",async(req,res)=>{
      const favorite=req.body;
      const isExist= await favoriteCollection.findOne({propertyId:favorite.propertyId})
      if(isExist){
        return res.json({ msg: "Already Exists!" });
      }
      const updatedFavorite={
        ...favorite,
        createdAt: new Date(),
      }
      const result=await favoriteCollection.insertOne(updatedFavorite);
      res.send(result)
    })

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
