import { Base } from "../../service/base.js";

export default class UnavailabilityController extends Base {
  constructor() {
    super();
  }

  // -------------------------------
  //  ADD UNAVAILABILITY
  // -------------------------------
  async addUnavailability(req, res) {
    try {
      const interpreter_id = req._id;

      const {
        from_date,
        to_date,
        slots = [],               // [{start_time, end_time}]
        full_day_dates = []       // ["2024-11-02", ...]
      } = req.body;

      // Required validation
      if (this.varify_req(req, ["from_date", "to_date"])) {
        this.s = 0;
        this.m = "From date and to date required.";
        return this.send_res(res);
      }

      // ---------------------
      // MAKE DATE RANGE
      // ---------------------
      const start = new Date(from_date);
      const end = new Date(to_date);

      const dates = [];
      while (start <= end) {
        dates.push(start.toISOString().split("T")[0]);
        start.setDate(start.getDate() + 1);
      }

      await this.begin_transaction();

      let added = [];
      let skipped = [];

      for (const d of dates) {
        const isFullDay = full_day_dates.includes(d);

        // --------------------------------------
        // 1️⃣ CHECK IF FULL DAY ALREADY EXISTS
        // --------------------------------------
        const fullDayExists = await this.selectOne(
          `SELECT id FROM interpreter_unavailability 
           WHERE interpreter_id=? AND date=? AND is_full_day=1`,
          [interpreter_id, d]
        );

        if (fullDayExists) {
          skipped.push({ date: d, reason: "FULL_DAY_ALREADY_EXISTS" });
          continue;
        }

        // --------------------------------------
        // 2️⃣ IF ADDING FULL DAY
        // --------------------------------------
        if (isFullDay) {
          // remove all partial slots first
          await this.delete(
            `DELETE FROM interpreter_unavailability
             WHERE interpreter_id=? AND date=?`,
            [interpreter_id, d]
          );

          const insertId = await this.insert(
            `INSERT INTO interpreter_unavailability 
             (interpreter_id, date, is_full_day) 
             VALUES (?, ?, 1)`,
            [interpreter_id, d]
          );

          added.push({ id: insertId, date: d, type: "FULL_DAY" });
          continue;
        }

        // --------------------------------------
        // 3️⃣ IF FULL DAY DOES NOT EXIST → ADD TIME SLOTS
        // --------------------------------------
        for (const s of slots) {
          if (!s.start_time || !s.end_time) continue;

          // check if slot already exists
          const slotExists = await this.selectOne(
            `SELECT id FROM interpreter_unavailability
             WHERE interpreter_id=? AND date=? AND start_time=? AND end_time=? AND is_full_day=0`,
            [interpreter_id, d, s.start_time, s.end_time]
          );

          if (slotExists) {
            skipped.push({
              date: d,
              start_time: s.start_time,
              end_time: s.end_time,
              reason: "TIME_SLOT_EXISTS"
            });
            continue;
          }

          const insertId = await this.insert(
            `INSERT INTO interpreter_unavailability
             (interpreter_id, date, start_time, end_time, is_full_day)
             VALUES (?, ?, ?, ?, 0)`,
            [interpreter_id, d, s.start_time, s.end_time]
          );

          added.push({
            id: insertId,
            date: d,
            start_time: s.start_time,
            end_time: s.end_time,
            type: "PARTIAL"
          });
        }
      }

      await this.commit();

      this.s = 1;
      this.m = "Unavailability processed";
      this.r = { added, skipped };
      return this.send_res(res);

    } catch (err) {
      await this.rollback();
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // -------------------------------
  //  GET UNAVAILABILITY
  // -------------------------------
  async getUnavailability(req, res) {
    try {
      const interpreter_id = req._id;

      const rows = await this.select(
        `SELECT * FROM interpreter_unavailability
         WHERE interpreter_id=?
         ORDER BY date ASC, start_time ASC`,
        [interpreter_id]
      );

      this.s = 1;
      this.m = "Unavailability list fetched";
      this.r = rows;
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // -------------------------------
  //  DELETE UNAVAILABILITY
  // -------------------------------
  async deleteUnavailability(req, res) {
    try {
      const interpreter_id = req._id;
      const id = req.params.id;

      const entry = await this.selectOne(
        `SELECT id FROM interpreter_unavailability 
         WHERE id=? AND interpreter_id=?`,
        [id, interpreter_id]
      );

      if (!entry) {
        this.s = 0;
        this.m = "Entry not found";
        return this.send_res(res);
      }

      await this.delete(
        `DELETE FROM interpreter_unavailability WHERE id=?`,
        [id]
      );

      this.s = 1;
      this.m = "Deleted successfully";
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
}
