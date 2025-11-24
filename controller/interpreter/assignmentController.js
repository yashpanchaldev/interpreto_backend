import { Base } from "../../service/base.js";


const ALLOWED_STATUSES = [
  "open",
  "requested",
  "assigned",
  "in_route",
  "arrived",
  "started",
  "paused",
  "resume",
  "completed",
  "checked_out",
  "cancelled",
];

export default class AssignmentController extends Base {
  constructor() {
    super();
  }

  // ---------------------------
  // CREATE ASSIGNMENT (Client)
  // ---------------------------
  async createAssignment(req, res) {
    try {
      const user_id = req._id;
      const {
        title,
        description,
        language_from,
        language_to,
        location,
        date,
        start_time,
        end_time,
        estimated_hours,
        type,
        lat,
        lng,
        budget_min,
        budget_max,
      } = req.body;

      // Role check
      const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [
        user_id,
      ]);
      if (!user || user.role !== "client") {
        this.s = 0;
        this.m = "Only clients can create assignments";
        return this.send_res(res);
      }

      // Required fields
      if (
        !title ||
        !language_from ||
        !language_to ||
        !date ||
        !start_time ||
        !estimated_hours ||
        !type
      ) {
        this.s = 0;
        this.m = "Missing required fields";
        return this.send_res(res);
      }

      // Insert
      const insertId = await this.insert(
        `INSERT INTO assignments
         (client_id, title, description, language_from, language_to, location, date, start_time, end_time, estimated_hours, type, lat, lng, budget_min, budget_max)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user_id,
          title,
          description || null,
          language_from,
          language_to,
          location || null,
          date,
          start_time,
          end_time || null,
          estimated_hours,
          lat || null,
          lng || null,
          budget_min || null,
          budget_max || null,
        ]
      );

      this.s = 1;
      this.m = "Assignment created";
      this.r = { assignment_id: insertId };
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // ---------------------------
  // LIST / PAGINATED
  // ---------------------------
  async getAllAssignments(req, res) {
    try {
      console.log(req.query)
      const user_id = req._id;
      const page = Math.max(1, parseInt(req.query.page || "1"));
      const limit = Math.min(100, parseInt(req.query.limit || "20"));
      const offset = (page - 1) * limit;
      console.log(page)

      console.log(limit)
      const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [
        user_id,
      ]);
      console.log(user)
      if (!user) {
        this.s = 0;
        this.m = "User not found";
        return this.send_res(res);
      }

      let rows = [];
      if (user.role === "admin") {
        rows = await this.select(
          "SELECT * FROM assignments ORDER BY id DESC LIMIT ? OFFSET ?",
          [limit, offset]
        );
      } else if (user.role === "client") {
        rows = await this.select(
          "SELECT * FROM assignments WHERE client_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
          [user_id, limit, offset]
        );
      } else {
        rows = await this.select(
          `SELECT a.* FROM assignments a
           LEFT JOIN assignment_requests ar ON ar.assignment_id = a.id AND ar.interpreter_id = ?
           WHERE a.interpreter_id = ? OR ar.interpreter_id = ?
           ORDER BY a.id DESC
           LIMIT ? OFFSET ?`,
          [user_id, user_id, user_id, limit, offset]
        );
      }

      this.s = 1;
      this.m = "Assignments fetched";
      this.r = { page, limit, data: rows };
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // ---------------------------
  // SEARCH with filters (improved)
  // ---------------------------
async searchAssignments(req, res) {
  try {
    let {
      language_from,
      language_to,
      service_id,
      assignment_type_id,
      min_fee,
      max_fee,
      status,
      date,
      distance,
      lat,
      lng,
      verified,
      page,
      limit
    } = req.query;

    const clean = (v) =>
      v === undefined || v === "" || v === "undefined" ? null : v;

    language_from = clean(language_from);
    language_to = clean(language_to);
    service_id = clean(service_id);
    assignment_type_id = clean(assignment_type_id);
    min_fee = clean(min_fee);
    max_fee = clean(max_fee);
    status = clean(status);
    date = clean(date);
    distance = clean(distance);
    lat = clean(lat);
    lng = clean(lng);
    verified = clean(verified);

    const where = [];
    const params = [];

    if (language_from) {
      where.push("a.language_from = ?");
      params.push(language_from);
    }

    if (language_to) {
      where.push("a.language_to = ?");
      params.push(language_to);
    }

    if (service_id) {
      where.push("a.service_id = ?");
      params.push(service_id);
    }

    if (assignment_type_id) {
      where.push("a.assignment_type_id = ?");
      params.push(assignment_type_id);
    }

    if (status) {
      where.push("a.status = ?");
      params.push(status);
    }

    if (date) {
      where.push("a.date = ?");
      params.push(date);
    }

    if (verified === "1") {
      where.push("ip.verified = 1");
    }

    if (min_fee) {
      where.push("ip.fee_min >= ?");
      params.push(min_fee);
    }

    if (max_fee) {
      where.push("ip.fee_max <= ?");
      params.push(max_fee);
    }

    // ------------------------
    // DISTANCE FILTER
    // ------------------------
    let distanceSelect = "";
    if (lat && lng && distance) {
      distanceSelect = `,
        (
          3959 * ACOS(
            COS(RADIANS(?)) * COS(RADIANS(a.lat)) *
            COS(RADIANS(a.lng) - RADIANS(?)) +
            SIN(RADIANS(?)) * SIN(RADIANS(a.lat))
          )
        ) AS distance_miles`;

      params.unshift(lat, lng, lat);

      where.push(`
        (
          3959 * ACOS(
            COS(RADIANS(?)) * COS(RADIANS(a.lat)) *
            COS(RADIANS(a.lng) - RADIANS(?)) +
            SIN(RADIANS(?)) * SIN(RADIANS(a.lat))
          )
        ) <= ?
      `);

      params.push(distance);
    }

    const whereSQL = where.length ? "WHERE " + where.join(" AND ") : "";

    page = parseInt(page || "1");
    limit = parseInt(limit || "20");
    const offset = (page - 1) * limit;

    // ⭐ FULL JOIN including service & assignment names
    const sql = `
      SELECT 
        a.*,
        lf.name AS language_from_name,
        lt.name AS language_to_name,
        s.name AS service_name,
        at.name AS assignment_type_name,
        ip.fee_min,
        ip.fee_max,
        ip.verified
        ${distanceSelect}
      FROM assignments a
      LEFT JOIN languages lf ON lf.id = a.language_from
      LEFT JOIN languages lt ON lt.id = a.language_to
      LEFT JOIN services s ON s.id = a.service_id
      LEFT JOIN assignment_types at ON at.id = a.assignment_type_id
      LEFT JOIN interpreter_profiles ip ON ip.user_id = a.interpreter_id
      ${whereSQL}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const rows = await this.select(sql, params);

    this.s = 1;
    this.m = "Search results";
    this.r = { page, limit, data: rows };
    return this.send_res(res);
  } catch (err) {
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}


  // ---------------------------
  // Interpreter: Request assignment (Apply Now)
  // ---------------------------
  async requestInterpreter(req, res) {
    try {
      const interpreter_id = req._id;
      const { assignment_id, price_per_hour, additional_info } = req.body;

      if (!assignment_id || !price_per_hour) {
        this.s = 0;
        this.m = "assignment_id and price_per_hour required";
        return this.send_res(res);
      }

      // role check
      const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [
        interpreter_id,
      ]);
      if (!user || user.role !== "interpreter") {
        this.s = 0;
        this.m = "Only interpreters can send requests";
        return this.send_res(res);
      }

      const assignment = await this.selectOne(
        "SELECT id, status, client_id FROM assignments WHERE id = ?",
        [assignment_id]
      );
      if (!assignment) {
        this.s = 0;
        this.m = "Assignment not found";
        return this.send_res(res);
      }
      if (assignment.status === "assigned") {
        this.s = 0;
        this.m = "Already assigned";
        return this.send_res(res);
      }

      const exists = await this.selectOne(
        "SELECT id FROM assignment_requests WHERE assignment_id = ? AND interpreter_id = ?",
        [assignment_id, interpreter_id]
      );
      if (exists) {
        this.s = 0;
        this.m = "You already requested this assignment";
        return this.send_res(res);
      }

      const insertId = await this.insert(
        `INSERT INTO assignment_requests (assignment_id, interpreter_id, additional_info, price_per_hour, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', NOW())`,
        [assignment_id, interpreter_id, additional_info || null, price_per_hour]
      );

      // set assignment status to requested if it was open
      if (assignment.status === "open") {
        await this.update(
          "UPDATE assignments SET status = 'requested' WHERE id = ?",
          [assignment_id]
        );
      }

      this.s = 1;
      this.m = "Request submitted";
      this.r = { request_id: insertId };
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
  // ---------------------------
  // Client: Get all requests for assignment
  // ---------------------------
  async getAssignmentRequests(req, res) {
    try {
      const user_id = req._id;
      const assignment_id = req.params.assignment_id;

      if (!assignment_id) {
        this.s = 0;
        this.m = "assignment_id required";
        return this.send_res(res);
      }

      // ensure caller is owner (client) or admin
      const assignment = await this.selectOne(
        "SELECT client_id FROM assignments WHERE id = ?",
        [assignment_id]
      );
      
      if (!assignment) {
        this.s = 0;
        this.m = "Assignment not found";
        return this.send_res(res);
      }
      const caller = await this.selectOne(
        "SELECT role FROM users WHERE id = ?",
        [user_id]
      );

      if (caller.role !== "client" && assignment.client_id !== user_id) {
        this.s = 0;
        this.m = "Not authorized to view requests";
        return this.send_res(res);
      }

      const rows = await this.select(
        `SELECT ar.id AS request_id, ar.price_per_hour, ar.status, ar.additional_info, ar.created_at,
                u.id as interpreter_id, u.name as interpreter_name, u.avatar_url,
                ip.qualification, ip.experience_years, ip.fee_min, ip.fee_max
         FROM assignment_requests ar
         JOIN users u ON u.id = ar.interpreter_id
         LEFT JOIN interpreter_profiles ip ON ip.user_id = ar.interpreter_id
         WHERE ar.assignment_id = ?
         ORDER BY ar.created_at ASC`,
        [assignment_id]
      );

      this.s = 1;
      this.m = "Requests fetched";
      this.r = rows;
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // ---------------------------
  // Client: Approve a request (assign interpreter)
  // ---------------------------
  async approveRequest(req, res) {
    try {
      const user_id = req._id;
      const { request_id, assignment_id } = req.body;

      if (!request_id || !assignment_id) {
        this.s = 0;
        this.m = "request_id and assignment_id required";
        return this.send_res(res);
      }

      // ensure caller is client owner or admin
      const assignment = await this.selectOne(
        "SELECT client_id, status FROM assignments WHERE id = ?",
        [assignment_id]
      );
      if (!assignment) {
        this.s = 0;
        this.m = "Assignment not found";
        return this.send_res(res);
      }
      const caller = await this.selectOne(
        "SELECT role FROM users WHERE id = ?",
        [user_id]
      );
      if (caller.role !== "client" && assignment.client_id !== user_id) {
        this.s = 0;
        this.m = "Not authorized";
        return this.send_res(res);
      }

      // get request
      const reqRow = await this.selectOne(
        "SELECT interpreter_id FROM assignment_requests WHERE id = ? AND assignment_id = ?",
        [request_id, assignment_id]
      );
      if (!reqRow) {
        this.s = 0;
        this.m = "Request not found";
        return this.send_res(res);
      }

      const interpreter_id = reqRow.interpreter_id;

      // 1) assign interpreter to assignment
      await this.update(
        "UPDATE assignments SET interpreter_id = ?, status = 'assigned' WHERE id = ?",
        [interpreter_id, assignment_id]
      );

      // 2) Set chosen request to accepted
      await this.update(
        "UPDATE assignment_requests SET status = 'accepted' WHERE id = ?",
        [request_id]
      );

      // 3) Set other requests to rejected
      await this.update(
        "UPDATE assignment_requests SET status = 'rejected' WHERE assignment_id = ? AND id != ?",
        [assignment_id, request_id]
      );

      this.s = 1;
      this.m = "Interpreter assigned";
      this.r = { assignment_id, interpreter_id };
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // ---------------------------
  // Interpreter: My Requests (applied)
  // ---------------------------
  async getMyRequests(req, res) {
    try {
      const interpreter_id = req._id;

      const rows = await this.select(
        `SELECT ar.*, a.title, a.date, a.start_time, a.location, a.status AS assignment_status
         FROM assignment_requests ar
         JOIN assignments a ON a.id = ar.assignment_id
         WHERE ar.interpreter_id = ?
         ORDER BY ar.created_at DESC`,
        [interpreter_id]
      );

      this.s = 1;
      this.m = "My requests";
      this.r = rows;
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // ---------------------------
  // Interpreter: Upcoming assignments
  // ---------------------------
  async getUpcomingAssignments(req, res) {
    try {
      const interpreter_id = req._id;

      console.log(interpreter_id)
      const rows = await this.select(
        `SELECT * FROM assignments
         WHERE interpreter_id = ?
           AND status = 'assigned'
           AND CONCAT(date, ' ', start_time) > NOW()
         ORDER BY date ASC, start_time ASC`,
        [interpreter_id]
      );

      console.log(rows)
      this.s = 1;
      this.m = "Upcoming assignments";
      this.r = rows;
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // ---------------------------
  // Interpreter: Active assignments
  // ---------------------------
  async getActiveAssignments(req, res) {
    try {
      const interpreter_id = req._id;
      const rows = await this.select(
        `SELECT * FROM assignments
         WHERE interpreter_id = ?
           AND status IN ('in_route','arrived','started','paused')
         ORDER BY date ASC`,
        [interpreter_id]
      );

      this.s = 1;
      this.m = "Active assignments";
      this.r = rows;
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  } 

  // ---------------------------
  // Interpreter: Completed assignments
  // ---------------------------
  async getCompletedAssignments(req, res) {
    try {
      const interpreter_id = req._id;
      const rows = await this.select(
        `SELECT * FROM assignments
         WHERE interpreter_id = ?
           AND status IN ('completed','checked_out')
         ORDER BY date DESC`,
        [interpreter_id]
      );

      this.s = 1;
      this.m = "Completed assignments";
      this.r = rows;
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // ---------------------------
  // SESSION DETAILS (timeline + button)
  // ---------------------------
  async getSessionDetails(req, res) {
    try {
      const user_id = req._id;
      const assignment_id = req.params.assignment_id;

      const assignment = await this.selectOne(
        `SELECT a.*, u.name as client_name, u.avatar_url as client_avatar
         FROM assignments a
         LEFT JOIN users u ON u.id = a.client_id
         WHERE a.id = ?`,
        [assignment_id]
      );
      if (!assignment) {
        this.s = 0;
        this.m = "Assignment not found";
        return this.send_res(res);
      }

      // fetch timeline logs
      const logs = await this.select(
        `SELECT status, timestamp FROM assignment_status_logs WHERE assignment_id = ? ORDER BY timestamp ASC`,
        [assignment_id]
      );

      const timelineSteps = [
        "in_route",
        "arrived",
        "started",
        "paused",
        "resume",
        "completed",
        "checked_out",
      ];
      const timeline = timelineSteps.map((step) => {
        const l = logs.find((x) => x.status === step);
        return { status: step, time: l ? l.timestamp : null };
      });

      // compute current action button based on assignment.status
      let current_button = null;
      switch (assignment.status) {
        case "assigned":
          current_button = "In Route";
          break;
        case "in_route":
          current_button = "Arrived";
          break;
        case "arrived":
          current_button = "Start";
          break;
        case "started":
          current_button = "Pause";
          break;
        case "paused":
          current_button = "Resume";
          break;
        case "completed":
          current_button = "Checkout";
          break;
        case "checked_out":
          current_button = null;
          break;
      }

      // profile summary of interpreter
      const interpreterProfile = assignment.interpreter_id
        ? await this.selectOne(
            `SELECT u.id, u.name, u.avatar_url, ip.qualification, ip.experience_years
         FROM users u
         LEFT JOIN interpreter_profiles ip ON ip.user_id = u.id
         WHERE u.id = ?`,
            [assignment.interpreter_id]
          )
        : null;

      this.s = 1;
      this.m = "Session details";
      this.r = { assignment, timeline, current_button, interpreterProfile };
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // ---------------------------
  // UPDATE STATUS (interpreter)
  // ---------------------------
  async updateStatus(req, res) {
    try {
      const interpreter_id = req._id;
      const { assignment_id, status } = req.body;

      if (!assignment_id || !status) {
        this.s = 0;
        this.m = "assignment_id and status required";
        return this.send_res(res);
      }
      if (!ALLOWED_STATUSES.includes(status)) {
        this.s = 0;
        this.m = "Invalid status";
        return this.send_res(res);
      }

      const assignment = await this.selectOne(
        "SELECT id, date, start_time, status, interpreter_id FROM assignments WHERE id = ?",
        [assignment_id]
      );
      if (!assignment) {
        this.s = 0;
        this.m = "Assignment not found";
        return this.send_res(res);
      }

      // only assigned interpreter can change runtime statuses (except admin)
      const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [
        interpreter_id,
      ]);
      if (
        user.role !== "admin" &&
        assignment.interpreter_id !== interpreter_id
      ) {
        this.s = 0;
        this.m = "You are not the assigned interpreter";
        return this.send_res(res);
      }

      // prevent duplicate logs
      const already = await this.selectOne(
        "SELECT id FROM assignment_status_logs WHERE assignment_id = ? AND status = ?",
        [assignment_id, status]
      );
      if (already) {
        this.s = 0;
        this.m = "Status already recorded";
        return this.send_res(res);
      }

      // enforce order and timed rules
      if (status === "started") {
        const scheduled = new Date(
          `${assignment.date} ${assignment.start_time}`
        );
        console.log(scheduled)
        if (new Date() < scheduled) {
          this.s = 0;
          this.m = "Cannot start before scheduled time";
          return this.send_res(res);
        }
      }
      if (status === "completed") {
        const started = await this.selectOne(
          "SELECT id FROM assignment_status_logs WHERE assignment_id = ? AND status = 'started'",
          [assignment_id]
        );
        if (!started) {
          this.s = 0;
          this.m = "Cannot complete without starting";
          return this.send_res(res);
        }
      }
      if (status === "checked_out") {
        const completed = await this.selectOne(
          "SELECT id FROM assignment_status_logs WHERE assignment_id = ? AND status = 'completed'",
          [assignment_id]
        );
        if (!completed) {
          this.s = 0;
          this.m = "Cannot checkout before completion";
          return this.send_res(res);
        }
      }

      // insert log
      await this.insert(
        "INSERT INTO assignment_status_logs (assignment_id, interpreter_id, status, timestamp) VALUES (?, ?, ?, NOW())",
        [assignment_id, interpreter_id, status]
      );

      // update assignment status
      await this.update("UPDATE assignments SET status = ? WHERE id = ?", [
        status,
        assignment_id,
      ]);

      this.s = 1;
      this.m = "Status updated";
      this.r = { assignment_id, status };
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  async submitIncompleteCase(req, res) {
  try {
    const interpreter_id = req._id;

    const { assignment_id, reason, additional_details } = req.body;

    if (!assignment_id || !reason) {
      this.s = 0;
      this.m = "assignment_id and reason are required";
      return this.send_res(res);
    }

    // Check assignment belongs to interpreter
    const row = await this.selectOne(
      `SELECT id FROM assignments 
       WHERE id = ? AND interpreter_id = ?`,
      [assignment_id, interpreter_id]
    );

    if (!row) {
      this.s = 0;
      this.m = "Invalid assignment";
      return this.send_res(res);
    }

    // Insert incomplete case
    await this.insert(
      `INSERT INTO assignment_incomplete_cases 
      (assignment_id, interpreter_id, reason, additional_details)
       VALUES (?, ?, ?, ?)`,
      [assignment_id, interpreter_id, reason, additional_details || null]
    );

    // Update assignment status → incomplete
    await this.update(
      `UPDATE assignments SET status='incomplete' WHERE id = ?`,
      [assignment_id]
    );

    this.s = 1;
    this.m = "Case submitted successfully";
    return this.send_res(res);

  } catch (err) {
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}



}
