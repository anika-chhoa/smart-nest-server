const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
require("dotenv").config();
const port = process.env.PORT;

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
    // await client.connect();
    // Send a ping to confirm a successful connection

    const database = client.db("smart-nest");
    const propertiesCollection = database.collection("properties");
    const userCollection = database.collection("user");
    const bookingCollection = database.collection("booking");
    const reviewCollection = database.collection("reviews");
    const favoriteCollection = database.collection("favorites");
    const RejectionReasonCollection = database.collection("rejections");

    //all users
    app.get("/api/users", verifyToken, adminVerify, async (req, res) => {
      try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const totalData = await userCollection.countDocuments();
        const totalPage = Math.ceil(totalData / Number(limit));

        const result = await userCollection
          .find()
          .skip(skip)
          .limit(Number(limit))
          .toArray();

        res.json({
          data: result,
          page: Number(page),
          totalPage,
          totalData,
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch users" });
      }
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

    app.get("/api/properties/:id", async (req, res) => {
      const { id } = req.params;
      const result = await propertiesCollection.findOne({
        _id: new ObjectId(id),
      });
      res.json(result);
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

    app.patch("/api/properties/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      try {
        const filter = { _id: new ObjectId(id) };
        const updateData = { $set: req.body }; // ✅ any name works
        const result = await propertiesCollection.updateOne(filter, updateData);
        res.json(result);
      } catch (err) {
        res.status(500).send(err.message);
      }
    });
    app.delete("/api/properties/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await propertiesCollection.deleteOne(query);
      res.send(result);
    });

    //Homepage properties
    app.get("/api/home-properties", async (req, res) => {
      const result = await propertiesCollection
        .find({ status: "approved" })
        .limit(6)
        .toArray();

      res.send(result);
    });

    //booking
    app.get("/api/bookings", verifyToken, async (req, res) => {
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

    app.patch(
      "/api/bookings/:id",
      verifyToken,
      ownerVerify,
      async (req, res) => {
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
      },
    );

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

      try {
        // Check if the booking already exists
        const isExist = await bookingCollection.findOne({ sessionId });
        if (isExist) {
          return res.status(400).json({ msg: "Already Exists!" });
        }

        // Insert the new booking with createdAt timestamp
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
          createdAt: new Date(),
        });

        res.json({ msg: "Payment Successful" });
      } catch (error) {
        console.error("Booking error:", error);
        res.status(500).json({ msg: "Internal Server Error" });
      }
    });

    //reviews
    app.get("/api/reviews", async (req, res) => {
      const result = await reviewCollection.find().limit(4).toArray();
      res.json(result);
    });
    app.post("/api/reviews", verifyToken, tenantVerify, async (req, res) => {
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
    app.get("/api/favorites", verifyToken, tenantVerify, async (req, res) => {
      const { page = 1, limit = 10, all } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const query = {};
      if (req.query.tenantId) {
        query.tenantId = req.query.tenantId;
      }
      if (req.query.propertyId) {
        query.propertyId = req.query.propertyId;
      }

      const totalData = await favoriteCollection.countDocuments(query);
      const totalPage = Math.ceil(totalData / Number(limit));

      let cursor = favoriteCollection.find(query);

      if (all !== "true") {
        cursor = cursor.skip(skip).limit(Number(limit));
      }

      const result = await cursor.toArray();

      res.send({
        data: result,
        page: Number(page),
        totalPage,
        totalData,
      });
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

    //tenant analytics
    
    app.get(
      "/api/tenant/analytics",
      verifyToken,
      tenantVerify,
      async (req, res) => {
        try {
          const tenantId = req.user.id || req.user.sub;

          const allBookings = await bookingCollection
            .find({ tenantId })
            .toArray();

          const totalBookings = allBookings.length;

          const approvedBookings = allBookings.filter(
            (b) =>
              b.BookingStatus?.toLowerCase() === "approved" ||
              b.BookingStatus?.toLowerCase() === "success",
          );
          const pendingBookings = allBookings.filter(
            (b) => b.BookingStatus?.toLowerCase() === "pending",
          );
          const cancelledBookings = allBookings.filter(
            (b) =>
              b.BookingStatus?.toLowerCase() === "cancelled" ||
              b.BookingStatus?.toLowerCase() === "rejected",
          );

          // FIX: Clean the string price safely exactly like the admin panel
          const totalSpent = approvedBookings.reduce((sum, b) => {
            const cleanPrice = String(b.price || 0).replace(/[^0-9.]/g, "");
            return sum + (Number(cleanPrice) || 0);
          }, 0);

          const totalFavorites = await favoriteCollection.countDocuments({
            tenantId,
          });

          const now = new Date();
          const monthlyMap = {};

          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const label = d.toLocaleString("default", {
              month: "short",
              year: "2-digit",
            });
            monthlyMap[key] = { month: label, spent: 0 };
          }

          approvedBookings.forEach((b) => {
            const rawDate = b.createdAt || b.moveInDate;
            if (!rawDate) return;

            const date = new Date(rawDate);
            if (isNaN(date.getTime())) return;

            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            if (monthlyMap[key]) {
              // FIX: Clean string price before calculating monthly aggregations
              const cleanPrice = String(b.price || 0).replace(/[^0-9.]/g, "");
              monthlyMap[key].spent += Number(cleanPrice) || 0;
            }
          });

          const monthlySpending = Object.values(monthlyMap);

          // FIX: Sort by actual record creation date, map id to string safely
          const recentBookings = [...allBookings]
            .sort(
              (a, b) =>
                new Date(b.createdAt || b.moveInDate) -
                new Date(a.createdAt || a.moveInDate),
            )
            .slice(0, 5) // Subheading says "Your 5 most recent reservations" — adjusted slice from 3 to 5
            .map((b) => ({
              id: String(b._id),
              title: b.title,
              location: b.location,
              price: b.price,
              rentType: b.rentType,
              moveInDate: b.moveInDate,
              status: b.BookingStatus,
              image: b.image,
              ownerName: b.ownerName,
            }));

          res.json({
            totalBookings,
            totalApproved: approvedBookings.length,
            totalPending: pendingBookings.length,
            totalCancelled: cancelledBookings.length,
            totalSpent,
            totalFavorites,
            monthlySpending,
            recentBookings,
          });
        } catch (error) {
          console.error("Tenant analytics error:", error);
          res.status(500).json({ error: "Failed to fetch tenant analytics" });
        }
      },
    );

    //owner analytics

    app.get(
      "/api/owner/analytics",
      verifyToken,
      ownerVerify,
      async (req, res) => {
        try {
          const ownerId = req.user?.id || req.user?.sub || req.user?._id;

          const totalProperties = await propertiesCollection.countDocuments({
            userId: ownerId,
          });

          const allBookings = await bookingCollection
            .find({ ownerId: ownerId })
            .toArray();

          const confirmedBookings = allBookings.filter((b) => {
            const status = b.BookingStatus?.toLowerCase();
            return status === "approved" || status === "success";
          });

          const totalBookings = confirmedBookings.length;

          const totalEarnings = confirmedBookings.reduce((sum, b) => {
            const cleanPrice = String(b.price || 0).replace(/[^0-9.]/g, "");
            return sum + (Number(cleanPrice) || 0);
          }, 0);

          // --- STABLE ROLLING 12-MONTH TIMELINE GENERATOR ---
          const monthlyMap = {};
          const now = new Date();

          for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), 1);
            d.setMonth(d.getMonth() - i);

            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const key = `${year}-${month}`;

            const label = d.toLocaleString("default", {
              month: "short",
              year: "2-digit",
            });

            monthlyMap[key] = { month: label, earnings: 0 };
          }

          // --- AGGREGATE DATA ENTRIES ---
          confirmedBookings.forEach((b) => {
            const rawDate = b.createdAt || b.moveInDate;
            if (!rawDate) return;

            let key = "";

            const date = new Date(rawDate);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, "0");
              key = `${year}-${month}`;
            } else if (typeof rawDate === "string" && rawDate.includes("-")) {
              const parts = rawDate.split("-");
              key = `${parts[0]}-${parts[1].padStart(2, "0")}`;
            }

            if (key && monthlyMap[key]) {
              const cleanPrice = String(b.price || 0).replace(/[^0-9.]/g, "");
              monthlyMap[key].earnings += Number(cleanPrice) || 0;
            }
          });

          const monthlyEarnings = Object.values(monthlyMap);

          // --- TEMP DEBUG - remove after fixing ---
          const debugMonthlyMap = {};
          const debugNow = new Date();
          for (let i = 11; i >= 0; i--) {
            const d = new Date(debugNow.getFullYear(), debugNow.getMonth(), 1);
            d.setMonth(d.getMonth() - i);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, "0");
            debugMonthlyMap[`${year}-${month}`] = true;
          }

          res.json({
            totalEarnings,
            totalProperties,
            totalBookings,
            monthlyEarnings,
            // TEMP DEBUG - remove after fixing
            debug: {
              ownerId,
              ownerIdType: typeof ownerId,
              allBookingsCount: allBookings.length,
              confirmedBookingsCount: confirmedBookings.length,
              confirmedBookingsSample: confirmedBookings
                .slice(0, 3)
                .map((b) => ({
                  ownerId: b.ownerId,
                  ownerIdType: typeof b.ownerId,
                  price: b.price,
                  status: b.BookingStatus,
                  createdAt: b.createdAt,
                  moveInDate: b.moveInDate,
                  dateKey: (() => {
                    const rawDate = b.createdAt || b.moveInDate;
                    if (!rawDate) return "NO DATE";
                    const date = new Date(rawDate);
                    if (!isNaN(date.getTime())) {
                      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
                    }
                    return "INVALID DATE: " + rawDate;
                  })(),
                })),
              monthlyMapKeys: Object.keys(debugMonthlyMap),
            },
          });
        } catch (error) {
          console.error("Owner analytics error:", error);
          res.status(500).json({ error: "Failed to fetch analytics" });
        }
      },
    );

    //admin analytics

    app.get(
      "/api/admin/analytics",
      verifyToken,
      adminVerify,
      async (req, res) => {
        try {
          // 1. Platform-wide counts
          const totalUsers = await userCollection.countDocuments();
          const totalProperties = await propertiesCollection.countDocuments();
          const totalBookings = await bookingCollection.countDocuments();

          // 2. Breakdown by role
          const totalOwners = await userCollection.countDocuments({
            role: "owner",
          });
          const totalTenants = await userCollection.countDocuments({
            role: "tenant",
          });

          // 3. Property status breakdown
          const pendingProperties = await propertiesCollection.countDocuments({
            status: "pending",
          });
          const approvedProperties = await propertiesCollection.countDocuments({
            status: "approved",
          });
          const rejectedProperties = await propertiesCollection.countDocuments({
            status: "rejected",
          });

          // 4. Gather & parse approved/success transactions safely
          const allBookings = await bookingCollection.find().toArray();
          const confirmedBookings = allBookings.filter((b) => {
            const status = b.BookingStatus?.toLowerCase();
            return status === "approved" || status === "success";
          });

          const totalRevenue = confirmedBookings.reduce((sum, b) => {
            const cleanPrice = String(b.price || 0).replace(/[^0-9.]/g, "");
            return sum + (Number(cleanPrice) || 0);
          }, 0);

          // 5. --- STABLE ROLLING 12-MONTH TIMELINE GENERATOR ---
          const monthlyMap = {};
          const now = new Date();

          for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), 1);
            d.setMonth(d.getMonth() - i);

            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const key = `${year}-${month}`;

            const label = d.toLocaleString("default", {
              month: "short",
              year: "2-digit",
            });

            // Structure keys matches frontend Recharts requirements (revenue and bookings)
            monthlyMap[key] = { month: label, revenue: 0, bookings: 0 };
          }

          // 6. --- AGGREGATE DATA ENTRIES ---
          confirmedBookings.forEach((b) => {
            const rawDate = b.createdAt || b.moveInDate;
            if (!rawDate) return;

            let key = "";
            const date = new Date(rawDate);

            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, "0");
              key = `${year}-${month}`;
            } else if (typeof rawDate === "string" && rawDate.includes("-")) {
              const parts = rawDate.split("-");
              key = `${parts[0]}-${parts[1].padStart(2, "0")}`;
            }

            if (key && monthlyMap[key]) {
              const cleanPrice = String(b.price || 0).replace(/[^0-9.]/g, "");
              monthlyMap[key].revenue += Number(cleanPrice) || 0;
              monthlyMap[key].bookings += 1;
            }
          });

          const monthlyStats = Object.values(monthlyMap);

          // 7. Property type breakdown
          const propertyTypes = await propertiesCollection
            .aggregate([
              { $group: { _id: "$propertyType", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ])
            .toArray();

          const propertyTypeStats = propertyTypes.map((p) => ({
            type: p._id || "Unknown",
            count: p.count,
          }));

          // Return identical payload shapes matching your frontend variables
          res.json({
            totalUsers,
            totalOwners,
            totalTenants,
            totalProperties,
            totalBookings,
            totalRevenue,
            pendingProperties,
            approvedProperties,
            rejectedProperties,
            monthlyStats,
            propertyTypeStats,
          });
        } catch (error) {
          console.error("Admin analytics error:", error);
          res.status(500).json({ error: "Failed to fetch admin analytics" });
        }
      },
    );
    // await client.db("admin").command({ ping: 1 });
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
