import { useEffect, useState } from "react";
import { apiGet } from "../api/client";

type Tx = {
  id: number;
  amount_vnd: number;
  tx_type: string;
  description: string | null;
  balance_after: number | null;
  created_at: string | null;
};

export default function Transactions() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    apiGet<{ total: number; transactions: Tx[] }>("/api/transactions?limit=50").then(
      (d) => {
        setTotal(d.total);
        setRows(d.transactions || []);
      },
    );
  }, []);

  return (
    <div className="page-enter">
      <h1 className="page-title-gradient" style={{ marginTop: 0 }}>
        Lịch sử giao dịch
      </h1>
      <p style={{ color: "var(--muted)" }}>Tổng: {total} bản ghi</p>
      <div className="card card-lift" style={{ overflow: "auto" }}>
      <table className="data">
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>Loại</th>
            <th>Số tiền</th>
            <th>Mô tả</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>{t.created_at?.replace("T", " ").slice(0, 19)}</td>
              <td>{t.tx_type}</td>
              <td>{t.amount_vnd?.toLocaleString("vi-VN")}₫</td>
              <td>{t.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
