const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
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

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided.",
    });
  }
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};
const tenantVerify = async (req, res, next) => {
  const user = req.user;
  if (user.role !== "tenant") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};
const ownerVerify = async (req, res, next) => {
  const user = req.user;
  if (user.role !== "owner") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};
const adminVerify = async (req, res, next) => {
  const user = req.user;
  if (user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

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
    const favoriteCollection = database.collection("favorites");
    const RejectionReasonCollection = database.collection("rejections");

    //all users
    app.get("/api/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.patch("/api/users/:id", async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: role },
      };

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //properties
    app.get("/api/properties", async (req, res) => {
      const { page = 1, limit = 9, all } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      let query = {};
      if (req.query.status) {
        query.status = req.query.status;
      }
      if (req.query.search && req.query.search !== "undefined") {
        query.location = { $regex: req.query.search, $options: "i" };
      }
      if (req.query.propertyType) {
        query.propertyType = req.query.propertyType;
      }
      if (req.query.userId) {
        query.userId = req.query.userId;
      }
      if (req.query.minPrice || req.query.maxPrice) {
        const min = req.query.minPrice ? Number(req.query.minPrice) : null;
        const max = req.query.maxPrice ? Number(req.query.maxPrice) : null;
        query.$expr = {
          $and: [
            ...(min !== null
              ? [{ $gte: [{ $toDouble: "$rentPrice" }, min] }]
              : []),
            ...(max !== null
              ? [{ $lte: [{ $toDouble: "$rentPrice" }, max] }]
              : []),
          ],
        };
      }

      let sortDirection = 0;
      if (req.query.sort === "low-to-high") {
        sortDirection = 1;
      } else if (req.query.sort === "high-to-low") {
        sortDirection = -1;
      }

      let pipeline = [{ $match: query }];

      if (sortDirection !== 0) {
        pipeline.push(
          {
            $addFields: {
              numericRentPrice: { $toDouble: "$rentPrice" },
            },
          },
          { $sort: { numericRentPrice: sortDirection } },
        );
      }

      if (all !== "true") {
        const skip = (Number(page) - 1) * Number(limit);
        pipeline.push({ $skip: skip }, { $limit: Number(limit) });
      }

      const result = await propertiesCollection.aggregate(pipeline).toArray();

      const totalData = await propertiesCollection.countDocuments(query);
      const totalPage = Math.ceil(totalData / Number(limit));

      res.send({ data: result, page: Number(page), totalPage, totalData });
    });

    app.get("/api/properties/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const result = await propertiesCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.post("/api/properties", verifyToken, ownerVerify, async (req, res) => {
      const property = req.body;
      const newProperty = {
        ...property,
        createdAt: new Date(),
      };
      const result = await propertiesCollection.insertOne(newProperty);
      res.send(result);
    });

    app.patch(
      "/api/properties/:id",
      verifyToken,
      ownerVerify,
      async (req, res) => {
        const id = req.params.id;
        const updatedData = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: updatedData,
        };

        const result = await propertiesCollection.updateOne(filter, updateDoc);
        res.send(result);
      },
    );

    app.delete(
      "/api/properties/:id",
      verifyToken,
      ownerVerify,
      async (req, res) => {
        const id = req.params.id;
        const query = {
          _id: new ObjectId(id),
        };
        const result = await propertiesCollection.deleteOne(query);
        res.send(result);
      },
    );

    //Homepage properties
    app.get("/api/home-properties", async (req, res) => {
      const result = await propertiesCollection
        .find({ status: "approved" })
        .limit(6)
        .toArray();

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

    app.patch("/api/bookings/:id", verifyToken, ownerVerify, async (req, res) => {
      const { id } = req.params;
      const { BookingStatus } = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          BookingStatus: BookingStatus,
        },
      };

      const result = await bookingCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.post("/api/bookings", verifyToken, tenantVerify, async (req, res) => {
      const {
        sessionId,
        transactionId,
        chargeId,
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
        image,
      } = req.body;
      const isExist = await bookingCollection.findOne({ sessionId });
      if (isExist) {
        return res.json({ msg: "Already Exists!" });
      }
      await bookingCollection.insertOne({
        sessionId,
        transactionId,
        chargeId,
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
        image,
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
    app.get("/api/favorites", async (req, res) => {
      const query = {};
      if (req.query.tenantId) {
        query.tenantId = req.query.tenantId;
      }
      if (req.query.propertyId) {
        query.propertyId = req.query.propertyId;
      }
      const cursor = favoriteCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/api/favorites", verifyToken, tenantVerify, async (req, res) => {
      try {
        const favorite = req.body;
        const isExist = await favoriteCollection.findOne({
          tenantId: favorite.tenantId,
          propertyId: favorite.propertyId,
        });

        if (isExist) {
          return res.json({ msg: "Already Exists!" });
        }

        const updatedFavorite = {
          ...favorite,
          createdAt: new Date(),
        };

        const result = await favoriteCollection.insertOne(updatedFavorite);
        return res.json(result);
      } catch (error) {
        return res.status(500).json({ error: "Failed to insert favorite" });
      }
    });

    app.delete(
      "/api/favorites/:id",
      verifyToken,
      tenantVerify,
      async (req, res) => {
        const id = req.params.id;
        const query = {
          _id: new ObjectId(id),
        };
        const result = await favoriteCollection.deleteOne(query);
        res.send(result);
      },
    );

    //rejection reasons
    app.post("/api/rejections", verifyToken, adminVerify, async (req, res) => {
      const rejection = req.body;
      const newRejection = {
        ...rejection,
        createdAt: new Date(),
      };
      const result = await RejectionReasonCollection.insertOne(newRejection);
      res.send(result);
    });

    //owner analytics
    app.get(
      "/api/owner/analytics",
      verifyToken,
      ownerVerify,
      async (req, res) => {
        try {
          const ownerId = req.user.id || req.user.sub;

          const totalProperties = await propertiesCollection.countDocuments({
            userId: ownerId,
          });

          const allBookings = await bookingCollection
            .find({ ownerId: ownerId })
            .toArray();
          console.log("ownerId:", ownerId);
          console.log("allBookings count:", allBookings.length);

          const confirmedBookings = allBookings.filter((b) => {
            const status = b.BookingStatus?.toLowerCase();
            return status === "approved" || status === "success";
          });

          const totalBookings = confirmedBookings.length;
          console.log("ownerId from token:", ownerId);
          console.log("sample booking ownerId:", allBookings[0]?.ownerId);
          console.log("match:", ownerId === allBookings[0]?.ownerId);

          const totalEarnings = confirmedBookings.reduce((sum, b) => {
            return sum + (Number(b.price) || 0);
          }, 0);
          console.log("ownerId:", ownerId);
          console.log("allBookings:", allBookings);
          console.log("confirmedBookings:", confirmedBookings);

          const now = new Date();
          const twelveMonthsAgo = new Date(
            now.getFullYear(),
            now.getMonth() - 11,
            1,
          );

          const monthlyMap = {};

          for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const label = d.toLocaleString("default", {
              month: "short",
              year: "2-digit",
            });
            monthlyMap[key] = { month: label, earnings: 0 };
          }

          confirmedBookings.forEach((b) => {
            const date = new Date(b.createdAt || b.moveInDate);
            if (date >= twelveMonthsAgo) {
              const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
              if (monthlyMap[key]) {
                monthlyMap[key].earnings += Number(b.price) || 0;
              }
            }
          });

          const monthlyEarnings = Object.values(monthlyMap);

          res.json({
            totalEarnings,
            totalProperties,
            totalBookings,
            monthlyEarnings,
          });
        } catch (error) {
          console.error("Owner analytics error:", error);
          res.status(500).json({ error: "Failed to fetch analytics" });
        }
      },
    );

    

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
