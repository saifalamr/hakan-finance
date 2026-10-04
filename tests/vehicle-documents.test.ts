import { test } from "node:test";
import assert from "node:assert/strict";
import { businessDB, admin, outsider } from "./business-fixture";
import {
  documentStatus,
  documentWarnings,
  documentWarningLabel,
  validateDocumentDates,
  daysBetween,
  validDate,
  type VehicleDocument,
  type DocumentType,
} from "../src/lib/vehicle-documents";
const doc = (
  type: DocumentType,
  end: string | null,
  extra: Partial<VehicleDocument> = {},
): VehicleDocument => ({
  id: type,
  type,
  user_id: admin,
  vehicle_id: "v1",
  start_date: null,
  end_date: end,
  provider: null,
  policy_number: null,
  notes: null,
  file_path: null,
  created_at: "",
  updated_at: "",
  ...extra,
});
test("date-only expiry boundaries, optional data, all types and most urgent warning", () => {
  const reference = "2026-10-04";
  assert.equal(documentStatus(undefined, reference).tone, "neutral");
  assert.equal(documentStatus(doc("ruhsat", null), reference).tone, "neutral");
  assert.equal(
    documentStatus(doc("ruhsat", null, { notes: "Ruhsat mevcut" }), reference)
      .label,
    "Mevcut",
  );
  for (const type of ["muayene", "sigorta", "kasko"] as const) {
    assert.equal(
      documentStatus(doc(type, "2026-11-04"), reference).tone,
      "normal",
    );
    assert.equal(documentStatus(doc(type, "2026-11-03"), reference).days, 30);
    assert.equal(
      documentStatus(doc(type, "2026-11-03"), reference).tone,
      "attention",
    );
    assert.equal(documentStatus(doc(type, "2026-10-05"), reference).days, 1);
    assert.equal(
      documentStatus(doc(type, "2026-10-04"), reference).tone,
      "high",
    );
    assert.equal(
      documentStatus(doc(type, "2026-10-03"), reference).tone,
      "high",
    );
    assert.equal(
      documentStatus(doc(type, null, { start_date: "2026-10-01" }), reference)
        .tone,
      "neutral",
    );
    assert.equal(
      documentStatus(
        doc(type, "2027-10-05", { start_date: "2026-10-05" }),
        reference,
      ).tone,
      "neutral",
    );
  }
  assert.equal(daysBetween("2026-03-30", "2026-03-29"), 1);
  assert.equal(daysBetween("2027-01-01", "2026-12-31"), 1);
  assert.equal(daysBetween("2024-03-01", "2024-02-28"), 2);
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.throws(() => validateDocumentDates("2026-02-30", ""), /Geçerli/);
  assert.throws(
    () => validateDocumentDates("2026-10-05", "2026-10-04"),
    /önce/,
  );
  validateDocumentDates("", "");
  validateDocumentDates("2026-10-04", "2026-10-04");
  const warnings = documentWarnings(
    [
      doc("kasko", "2026-10-20"),
      doc("sigorta", "2026-10-01"),
      doc("muayene", "2026-10-10"),
    ],
    reference,
  );
  assert.deepEqual(
    warnings.map((w) => w.document.type),
    ["sigorta", "muayene", "kasko"],
  );
  assert.equal(documentWarningLabel(warnings[0]), "Sigorta süresi doldu");
});
test("vehicle documents migration protects owner, identity, dates, vehicles and private files", async () => {
  const db = await businessDB();
  try {
    const vehicle = (
      await db.query<{ id: string }>(
        `insert into vehicles(user_id,plate,brand,model)values('${admin}','34 DOC 1','Ford','Transit')returning id`,
      )
    ).rows[0].id;
    const second = (
      await db.query<{ id: string }>(
        `insert into vehicles(user_id,plate,brand,model)values('${admin}','34 DOC 2','Ford','Transit')returning id`,
      )
    ).rows[0].id;
    const saved = (
      await db.query<{ id: string }>(
        `insert into vehicle_documents(user_id,vehicle_id,type,start_date,end_date,provider,policy_number)values('${admin}','${vehicle}','sigorta','2026-01-01','2027-01-01','Yerel Şirket','POL-123')returning id`,
      )
    ).rows[0].id;
    await assert.rejects(
      db.exec(
        `insert into vehicle_documents(user_id,vehicle_id,type)values('${admin}','${vehicle}','sigorta')`,
      ),
      /unique/,
    );
    await assert.rejects(
      db.exec(
        `update vehicle_documents set end_date='2025-12-31' where id='${saved}'`,
      ),
      /check/,
    );
    await assert.rejects(
      db.exec(
        `update vehicle_documents set vehicle_id='${second}' where id='${saved}'`,
      ),
      /identity/,
    );
    await assert.rejects(
      db.exec(`delete from vehicle_documents where id='${saved}'`),
      /permission denied/,
    );
    const oldPath = `${admin}/${vehicle}/sigorta/00000000-0000-0000-0000-000000000010.pdf`;
    const newPath = `${admin}/${vehicle}/sigorta/00000000-0000-0000-0000-000000000011.jpg`;
    for (const name of [oldPath, newPath])
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata)values('vehicle-documents',$1,'{\"size\":1024}')",
        [name],
      );
    await db.query("update vehicle_documents set file_path=$1 where id=$2", [
      oldPath,
      saved,
    ]);
    assert.equal(
      (
        await db.query(
          "delete from storage.objects where name=$1 returning id",
          [oldPath],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("update vehicle_documents set file_path=$1 where id=$2", [
        `${admin}/${second}/sigorta/00000000-0000-0000-0000-000000000011.jpg`,
        saved,
      ]),
      /check/,
    );
    await db.query(
      "update vehicle_documents set file_path=$1,start_date=null,provider=null,notes=null where id=$2",
      [newPath, saved],
    );
    assert.equal(
      (
        await db.query(
          "delete from storage.objects where name=$1 returning id",
          [oldPath],
        )
      ).rows.length,
      1,
    );
    await db.query("update vehicle_documents set file_path=null where id=$1", [
      saved,
    ]);
    assert.equal(
      (
        await db.query(
          "delete from storage.objects where name=$1 returning id",
          [newPath],
        )
      ).rows.length,
      1,
    );
    await db.exec(
      `update vehicles set archived_at=now() where id='${vehicle}'`,
    );
    assert.equal(
      (await db.query("select * from vehicle_documents")).rows.length,
      1,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${outsider}',false)`,
    );
    assert.equal(
      (await db.query("select * from vehicle_documents")).rows.length,
      0,
    );
    await assert.rejects(
      db.exec(
        `insert into vehicle_documents(user_id,vehicle_id,type)values('${outsider}','${vehicle}','kasko')`,
      ),
      /foreign key/,
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name)values('vehicle-documents',$1)",
        [`${outsider}/${vehicle}/muayene/test.pdf`],
      ),
      /row-level security/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${admin}',false);reset role;`,
    );
    await assert.rejects(
      db.exec(`delete from vehicles where id='${vehicle}'`),
      /foreign key/,
    );
    const bucket = (
      await db.query<{ public: boolean; file_size_limit: number }>(
        "select public,file_size_limit from storage.buckets where id='vehicle-documents'",
      )
    ).rows[0];
    assert.equal(bucket.public, false);
    assert.equal(Number(bucket.file_size_limit), 2097152);
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata)values('vehicle-documents',$1,'{\"size\":209715200}')",
      [`${admin}/${vehicle}/muayene/quota.pdf`],
    );
    await db.exec(`set role authenticated`);
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name,metadata)values('vehicle-documents',$1,'{\"size\":10}')",
        [`${admin}/${vehicle}/kasko/full.pdf`],
      ),
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});
