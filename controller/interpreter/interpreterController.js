import { Base } from "../../service/base.js";

export default class interpreterController extends Base {
  constructor() {
    super();
  }
async searchInterpreters(req, res) {
  try {
    const user_id = req._id;

    const client = await this.selectOne(
      "SELECT latitude, longitude FROM users WHERE id = ?",
      [user_id]
    );

    const clientLat = client?.latitude;
    const clientLng = client?.longitude;

    let {
      language_from,
      language_to,
      service_ids,        // array
      assignment_ids,     // array
      distance,
      rating,
      verified,
      state,
      city,
      min_fee,
      max_fee
    } = req.query;

    // Convert CSV → array
    service_ids = service_ids ? service_ids.split(",") : [];
    assignment_ids = assignment_ids ? assignment_ids.split(",") : [];

    const where = ["u.role='interpreter'", "u.status='active'"];
    const params = [];

    // LANGUAGE FROM → interpreter has that language_id
    if (language_from) {
      where.push(`
        EXISTS (
          SELECT 1 FROM interpreter_languages il
          WHERE il.interpreter_id = u.id
          AND il.language_id = ?
        )
      `);
      params.push(language_from);
    }

    // LANGUAGE TO → interpreter has that language_id
    if (language_to) {
      where.push(`
        EXISTS (
          SELECT 1 FROM interpreter_languages il2
          WHERE il2.interpreter_id = u.id
          AND il2.language_id = ?
        )
      `);
      params.push(language_to);
    }
    // SERVICES MULTI SELECT
    if (service_ids.length > 0) {
      where.push(`
        EXISTS (
          SELECT 1 FROM interpreter_services isv
          WHERE isv.interpreter_id = u.id
          AND isv.service_id IN (${service_ids.map(() => "?").join(",")})
        )
      `);
      params.push(...service_ids);
    }

    // ASSIGNMENT TYPES MULTI SELECT
    if (assignment_ids.length > 0) {
      where.push(`
        EXISTS (
          SELECT 1 FROM interpreter_assignment_types iat
          WHERE iat.interpreter_id = u.id
          AND iat.assignment_type_id IN (${assignment_ids.map(() => "?").join(",")})
        )
      `);
      params.push(...assignment_ids);
    }

    // VERIFIED
    if (verified === "1") {
      where.push("ip.verified = 1");
    }


    // FEE RANGE
    if (min_fee) {
      where.push("ip.fee_min >= ?");
      params.push(min_fee);
    }
    if (max_fee) {
      where.push("ip.fee_max <= ?");
      params.push(max_fee);
    }

    // STATE / CITY → lookup from cities table
    if (state || city) {
      const loc = await this.selectOne(
        `SELECT latitude, longitude FROM cities 
         WHERE state = ? OR city = ? LIMIT 1`,
        [state, city]
      );
      if (loc) {
        clientLat = loc.latitude;
        clientLng = loc.longitude;
      }
    }

    // DISTANCE FILTER
    let distanceSelect = "NULL AS distance_miles";
    if (distance && clientLat && clientLng) {
      distanceSelect = `
        (
          3959 * acos(
            cos(radians(${clientLat}))
            * cos(radians(u.latitude))
            * cos(radians(u.longitude) - radians(${clientLng}))
            + sin(radians(${clientLat}))
            * sin(radians(u.latitude))
          )
        ) AS distance_miles
      `;

      where.push(`
        (
          3959 * acos(
            cos(radians(${clientLat}))
            * cos(radians(u.latitude))
            * cos(radians(u.longitude) - radians(${clientLng}))
            + sin(radians(${clientLat}))
            * sin(radians(u.latitude))
          )
        ) <= ${distance}
      `);
    }

    const sql = `
      SELECT 
        u.id, u.name, u.email, u.phone,
        u.latitude, u.longitude,
        ip.fee_min, ip.fee_max, ip.verified,
        ${distanceSelect},

        -- Get full service list as JSON
        (
          SELECT JSON_ARRAYAGG(s.name)
          FROM interpreter_services isv
          JOIN services s ON s.id = isv.service_id
          WHERE isv.interpreter_id = u.id
        ) AS service_names,

        -- Get assignment types as JSON
        (
          SELECT JSON_ARRAYAGG(at.name)
          FROM interpreter_assignment_types iat
          JOIN assignment_types at ON at.id = iat.assignment_type_id
          WHERE iat.interpreter_id = u.id
        ) AS assignment_type_names,

        -- Get languages as JSON
        (
          SELECT JSON_ARRAYAGG(l.name)
          FROM interpreter_languages il
          JOIN languages l ON l.id = il.language_id
          WHERE il.interpreter_id = u.id
        ) AS languages

      FROM users u
      JOIN interpreter_profiles ip ON ip.user_id = u.id
      WHERE ${where.join(" AND ")}
      ORDER BY distance_miles IS NULL, distance_miles ASC
    `;

    const data = await this.select(sql, params);

    this.s = 1;
    this.m = "Interpreters fetched";
    this.r = data;
    return this.send_res(res);

  } catch (error) {
    this.s = 0;
    this.err = error.message;
    return this.send_res(res);
  }
}

async hireDirect(req, res) {
  try {
    const required = [
      "interpreter_id",
      "language_from",
      "language_to",
      "service_id",
      "assignment_type_id",
      "date",
      "start_time",
      "estimated_hours",
    ];

    if (this.varify_req(req, required)) return this.send_res(res);

    const client_id = req._id;

    const checkClient = await this.selectOne(
      "SELECT role FROM users WHERE id = ?",
      [client_id]
    );

    if (!checkClient || checkClient.role !== "client") {
      this.s = 0;
      this.m = "Only client can hire interpreter";
      return this.send_res(res);
    }

    const {
      interpreter_id,
      title,
      description,
      language_from,
      language_to,
      service_id,
      assignment_type_id,
      date,
      start_time,
      end_time,
      estimated_hours,
      location,
      lat,
      lng
    } = req.body;

    // Check interpreter exists
    const interpreter = await this.selectOne(
      "SELECT id FROM users WHERE id = ? AND role='interpreter'",
      [interpreter_id]
    );

    if (!interpreter) {
      this.s = 0;
      this.m = "Interpreter not found";
      return this.send_res(res);
    }

    // 🔥 Get rate from interpreter_languages based on language_from
    const langRate = await this.selectOne(
      `SELECT hourly_rate 
       FROM interpreter_languages 
       WHERE interpreter_id = ? AND language_id = ?`,
      [interpreter_id, language_from]
    );

    if (!langRate) {
      this.s = 0;
      this.m = "Interpreter does not provide service for selected language";
      return this.send_res(res);
    }

    const price_per_hour = langRate.hourly_rate;

    // Begin Transaction
    await this.begin_transaction();

    // ➤ Create assignment
    const assignmentId = await this.insert(
      `INSERT INTO assignments (
        client_id, interpreter_id, title, description,
        language_from, language_to, service_id, assignment_type_id,
        date, start_time, end_time, estimated_hours,
        location, lat, lng, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested')`,
      [
        client_id,
        interpreter_id,
        title || null,
        description || null,
        language_from,
        language_to,
        service_id,
        assignment_type_id,
        date,
        start_time,
        end_time || null,
        estimated_hours,
        location || null,
        lat || null,
        lng || null
      ]
    );

    // ➤ Create hire_request
    await this.insert(
      `INSERT INTO hire_requests
      (assignment_id, client_id, interpreter_id, price_per_hour, status)
      VALUES (?, ?, ?, ?, 'pending')`,
      [assignmentId, client_id, interpreter_id, price_per_hour]
    );

    await this.commit();

    this.s = 1;
    this.m = "Hire request sent to interpreter";
    this.r = { assignment_id: assignmentId, price_per_hour };

    return this.send_res(res);

  } catch (err) {
    await this.rollback();
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}

async acceptHire(req, res) {
  try {
    const interpreter_id = req._id;
    const { hire_id } = req.body;

    if (!hire_id) {
      this.s = 0;
      this.m = "hire_id is required";
      return this.send_res(res);
    }

    // Check hire request belongs to interpreter
    const hireRow = await this.selectOne(
      `SELECT assignment_id 
       FROM hire_requests 
       WHERE id = ? AND interpreter_id = ?`,
      [hire_id, interpreter_id]
    );

    if (!hireRow) {
      this.s = 0;
      this.m = "Invalid hire request";
      return this.send_res(res);
    }

    const assignment_id = hireRow.assignment_id;

    await this.begin_transaction();

    // Accept hire request
    await this.update(
      `UPDATE hire_requests SET status='accepted' WHERE id = ?`,
      [hire_id]
    );

    // Update assignment
    await this.update(
      `UPDATE assignments 
       SET interpreter_id = ?, status = 'assigned'
       WHERE id = ?`,
      [interpreter_id, assignment_id]
    );

    // Insert log
    await this.insert(
      `INSERT INTO assignment_status_logs
       (assignment_id, interpreter_id, status)
       VALUES (?, ?, 'assigned')`,
      [assignment_id, interpreter_id]
    );

    await this.commit();

    this.s = 1;
    this.m = "Hire request accepted";
    this.r = { assignment_id };

    return this.send_res(res);

  } catch (err) {
    await this.rollback();
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}

async rejectHire(req, res) {
  try {
    const interpreter_id = req._id;
    const { hire_id } = req.body;

    if (!hire_id) {
      this.s = 0;
      this.m = "hire_id is required";
      return this.send_res(res);
    }

    // Check if hire request belongs to this interpreter
    const hireRow = await this.selectOne(
      `SELECT assignment_id 
       FROM hire_requests 
       WHERE id = ? AND interpreter_id = ?`,
      [hire_id, interpreter_id]
    );

    if (!hireRow) {
      this.s = 0;
      this.m = "Invalid hire request";
      return this.send_res(res);
    }

    const assignment_id = hireRow.assignment_id;

    await this.begin_transaction();

    // Reject hire request
    await this.update(
      `UPDATE hire_requests SET status='rejected' WHERE id = ?`,
      [hire_id]
    );

    // Assignment becomes open again
    await this.update(
      `UPDATE assignments SET status='open', interpreter_id=NULL WHERE id = ?`,
      [assignment_id]
    );

    await this.commit();

    this.s = 1;
    this.m = "Hire request rejected";
    this.r = { assignment_id };
    return this.send_res(res);

  } catch (err) {
    await this.rollback();
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}

async getMyAllRequests(req, res) {
  try {
    const interpreter_id = req._id;

    const sql = `
      (
        SELECT 
          ar.id AS request_id,
          ar.assignment_id,
          ar.status,
          ar.price_per_hour,
          ar.request_type AS type,
          a.title,
          a.date,
          a.start_time,
          a.location,
          u.name AS client_name
        FROM assignment_requests ar
        JOIN assignments a ON a.id = ar.assignment_id
        JOIN users u ON u.id = a.client_id
        WHERE ar.interpreter_id = ?
      )
      UNION
      (
        SELECT 
          hr.id AS request_id,
          hr.assignment_id,
          hr.status,
          hr.price_per_hour,
          'hire' AS type,
          a.title,
          a.date,
          a.start_time,
          a.location,
          u.name AS client_name
        FROM hire_requests hr
        JOIN assignments a ON a.id = hr.assignment_id
        JOIN users u ON u.id = a.client_id
        WHERE hr.interpreter_id = ?
      )
      ORDER BY request_id DESC
    `;

    const data = await this.select(sql, [interpreter_id, interpreter_id]);

    this.s = 1;
    this.m = "All requests fetched";
    this.r = data;
    return this.send_res(res);

  } catch (err) {
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}
}