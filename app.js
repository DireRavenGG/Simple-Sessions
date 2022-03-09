const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const dotenv = require("dotenv").config();
const cors = require("cors");
const connectRedis = require("connect-redis");
var cookieParser = require("cookie-parser");
const redis = require("redis");
const { hashSync, genSaltSync, compareSync } = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const REDIS_URL = process.env.REDIS_URL;

const PORT = process.env.PORT;

async function findUser(x) {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: {
        email: x,
      },
    });

    return user;
  } catch (e) {
    res.write("Non-Unique Email");
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  const app = express();
  app.use(cookieParser());
  const RedisStore = connectRedis(session);

  let redisClient = redis.createClient({
    url: REDIS_URL,
    host: "ec2-18-210-244-35.compute-1.amazonaws.com",
    port: "14900",
    socket: {
      tls: true,
      rejectUnauthorized: false,
    },
  });

  redisClient.on("error", (err) => console.log("Redis Client Error", err));

  await redisClient.connect();

  app.use(
    session({
      name: process.env.SESS_NAME,
      resave: false,
      store:
        process.env.NODE_ENV === "production"
          ? new RedisStore({ client: redisClient })
          : null,
      saveUninitialized: false,
      secret: process.env.SECRET,
      cookie: {
        path: "/",
        maxAge: 1000 * 60 * 5,
        httpOnly: false,
        secure: false,
      },
    })
  );
  app.use(cors());

  app.use(bodyParser.json());

  app.use(
    bodyParser.urlencoded({
      extended: true,
    })
  );
  app.listen(PORT, () => console.log(`http://localhost:${PORT}`));

  app.get("/", (req, res) => {
    const session = req.session;

    res.send(`  
    <h1>Yo</h1>
      ${
        session
          ? `<a href="/Home">Home</a>
          <form method="post" action="/logout">
            <button>Logout</button>
          </form> `
          : `<a href="/login">Login</a>
          <a href="/register">Register</a> `
      }
  
    `);
  });

  app.get("/home", async (req, res) => {
    const session = req.session;

    console.log(res.session);
    async function findUser(x) {
      const prisma = new PrismaClient();
      try {
        const user = await prisma.user.findFirst({
          where: {
            email: x,
          },
        });

        return user;
      } catch (e) {
        console.log(e);
      } finally {
        await prisma.$disconnect();
      }
    }

    const user = await findUser(session.email);

    res.send(`
    <h1>Home</h1>
    <a href="/"> Main </a>
    <ul>
      <li>Name: ${user.name}</li>
      <li>Email: ${user.email}</li>
    </ul
    `);
  });

  app.get("/login", (req, res) => {
    res.send(`
    <h1>Login</h1>
    <form method="post" action="/login">
      <Input type="email" name="email" placeholder="Email" required/>
      <Input type="password" name="password" placeholder="Password" required />
      <Input type="submit" />
    </form>
    <a href="/register"> Register</a>
  
      `);
  });

  app.get("/register", (req, res) => {
    res.send(`
    <h1>Register</h1>
    <form method="post" action="/register">
      <Input  name="name" placeholder="Name" required/>
      <Input type="email" name="email" placeholder="Email" required/>
      <Input type="password" name="password" placeholder="Password" required />
      <Input type="submit" />
    </form>
    <a href="/login">login</a>
      `);
    console.log(req.session);
  });

  app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (email && password) {
      const user = await findUser(email);

      if (!user) {
        res.redirect("/login");
        return;
      }
      const isValidPassword = compareSync(password, user.password);

      if (isValidPassword) {
        req.session.email = user.email;
        res.redirect("/home");
      } else {
        console.log("wrong email or password");
        res.redirect("/login");
      }
    } else {
      console.log("wrong email or password");
      res.redirect("/login");
    }
  });

  app.post("/register", async (req, res) => {
    let { name, email, password } = req.body;

    if (name && email && password) {
      const salt = genSaltSync(10);
      password = hashSync(password, salt);
      const isExisting = await findUser(email);
      if (isExisting) {
        res.redirect("/register");
        return;
      }
      const prisma = new PrismaClient();
      const user = await prisma.User.create({
        data: {
          email: email,
          name: name,
          password: password,
        },
      });
      await prisma.$disconnect();
      console.log(email);

      req.session.email = email;
      res.redirect("/home");
    } else {
      res.redirect("/register");
    }
  });
  app.post("/logout", (req, res) => {
    res.clearCookie("sid");
    res.redirect("/login");
  });
})();
