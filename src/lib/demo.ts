import { type Data, type Category, currentMonth, today } from "./finance";
export const demoUser = "00000000-0000-0000-0000-000000000001";
export function makeDemo(): Data {
  const user_id = demoUser;
  const month = currentMonth();
  const categories: Category[] = [
    "Yakıt",
    "Bakım",
    "Tamir",
    "Sigorta",
    "Vergi",
    "Otopark",
    "Personel",
    "Kira",
    "Diğer",
  ].map((name, i) => ({
    id: `c${i}`,
    user_id,
    name,
    type: "expense" as const,
  }));
  categories.push({
    id: "income",
    user_id,
    name: "Müşteri Ödemesi",
    type: "income",
  });
  const vehicles = [
    { id: "v1", user_id, plate: "34 ABC 123", brand: "Ford", model: "Transit" },
    { id: "v2", user_id, plate: "34 DEF 456", brand: "Fiat", model: "Doblo" },
  ];
  const employees = [
    { id: "e1", user_id, name: "Ahmet Yılmaz", salary: 3200000, work_days: 30 },
  ];
  const transactions: Data["transactions"] = [
    {
      id: "t1",
      user_id,
      type: "expense",
      amount: 240000,
      category_id: "c0",
      date: today(),
      description: "Depo dolumu",
      vehicle_id: "v1",
      employee_id: null,
      payroll_kind: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "t2",
      user_id,
      type: "income",
      amount: 850000,
      category_id: "income",
      date: `${month}-01`,
      description: "Müşteri Ödemesi",
      vehicle_id: null,
      employee_id: null,
      payroll_kind: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "t3",
      user_id,
      type: "expense",
      amount: 300000,
      category_id: "c6",
      date: `${month}-02`,
      description: "Personel Avans",
      vehicle_id: null,
      employee_id: "e1",
      payroll_kind: "advance",
      created_at: new Date().toISOString(),
    },
    {
      id: "t4",
      user_id,
      type: "income",
      amount: 4250000,
      category_id: "income",
      date: `${month}-02`,
      description: "Aylık hizmet bedeli",
      vehicle_id: null,
      employee_id: null,
      payroll_kind: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "t5",
      user_id,
      type: "expense",
      amount: 620000,
      category_id: "c1",
      date: `${month}-01`,
      description: "Periyodik bakım",
      vehicle_id: "v2",
      employee_id: null,
      payroll_kind: null,
      created_at: new Date().toISOString(),
    },
  ];
  return {
    categories,
    vehicles,
    employees,
    transactions,
    employee_periods: [
      {
        id: "p1",
        user_id,
        employee_id: "e1",
        month: `${month}-01`,
        salary: 3200000,
        work_days: 30,
      },
    ],
  };
}
