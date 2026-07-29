// enum tracking

export enum TrackingStatus {
  WAIT_QUEUE_APPROVAL = "รอแอดมินอนุมัติคิว",
  BOOKING_CONFIRMED = "จองคิวสำเร็จ",
  WAIT_FULL_PAYMENT = "รอชำระค่าบัตร (กรณีฝากจ่าย)",
  WAIT_ADMIN_CONFIRM = "รอแอดมินยืนยันข้อมูล",
  READY_TO_PRESS = "พร้อมกดบัตร",
  PREPARE_PRESS = "เตรียมตัวกดบัตร",
  PRESSING = "กำลังดำเนินการกดบัตร",
  PARTIAL_TICKETS = "ได้บัตรแล้ว (บางส่วน)",
  COMPLETE_TICKETS = "กดบัตรสำเร็จ",
  FAILED = "ไม่ได้รับบัตร",
  WAIT_SERVICE_FEE = "รอชำระค่ากดบัตร",
  WAIT_REFUND = "รอคืนเงิน",
  REFUNDED = "คืนเงินเรียบร้อย",
  DONE = "ดำเนินการเสร็จสมบูรณ์",
  CANCEL = "ยกเลิกคิว",
}

type StatusMetadata = {
  readonly description: string;
  readonly colorClass: string;
};

export const STATUS_METADATA: Record<TrackingStatus, StatusMetadata> = {
  [TrackingStatus.WAIT_QUEUE_APPROVAL]: {
    description: "ทางร้านได้รับข้อมูลแล้ว อยู่ระหว่างรอแอดมินตรวจสอบและอนุมัติคิว",
    colorClass: "bg-amber-100 text-amber-900",
  },
  [TrackingStatus.BOOKING_CONFIRMED]: {
    description: "ลูกค้าอุ่นใจได้ว่ามีชื่ออยู่ในระบบแล้ว",
    colorClass: "bg-emerald-100 text-emerald-800",
  },
  [TrackingStatus.WAIT_FULL_PAYMENT]: {
    description:
      "กรุณาชำระเงินค่าบัตรก่อนวันเวลาที่กำหนด มิเช่นนั้นสถานะจะถูกยกเลิก",
    colorClass: "bg-amber-100 text-amber-900",
  },
  [TrackingStatus.WAIT_ADMIN_CONFIRM]: {
    description: "แอดมินกำลังตรวจสอบและยืนยันข้อมูลการจองของลูกค้า",
    colorClass: "bg-amber-100 text-amber-900",
  },
  [TrackingStatus.READY_TO_PRESS]: {
    description: "ข้อมูลครบถ้วนแล้ว คิวพร้อมสำหรับการกดบัตร รอเวลาเปิดจอง",
    colorClass: "bg-sky-100 text-sky-800",
  },
  [TrackingStatus.PREPARE_PRESS]: {
    description: "ให้ลูกค้ารู้ว่าข้อมูลทุกอย่างเป๊ะแล้ว รอเวลาเปิดจอง",
    colorClass: "bg-sky-100 text-sky-800",
  },
  [TrackingStatus.PRESSING]: {
    description: "ระบบหรือทีมงานกำลังทำงานอยู่",
    colorClass: "bg-indigo-100 text-indigo-800",
  },
  [TrackingStatus.PARTIAL_TICKETS]: {
    description: "แจ้งความคืบหน้ากรณีสั่งหลายใบ",
    colorClass: "bg-blue-100 text-blue-800",
  },
  [TrackingStatus.COMPLETE_TICKETS]: {
    description: "ข่าวดี! ทีมงานกดได้ครบตามจำนวน",
    colorClass: "bg-emerald-100 text-emerald-800",
  },
  [TrackingStatus.FAILED]: {
    description: "ทีมงานกดให้ไม่ได้",
    colorClass: "bg-rose-100 text-rose-700",
  },
  [TrackingStatus.WAIT_SERVICE_FEE]: {
    description: "รอชำระค่ากดบัตร",
    colorClass: "bg-amber-200 text-amber-900",
  },
  [TrackingStatus.WAIT_REFUND]: {
    description: "รอคืนเงินจากทางร้าน",
    colorClass: "bg-purple-100 text-purple-800",
  },
  [TrackingStatus.REFUNDED]: {
    description: "คืนเงินสำเร็จ",
    colorClass: "bg-teal-100 text-teal-800",
  },
  [TrackingStatus.DONE]: {
    description: "จบงาน บัตรส่งถึงมือ",
    colorClass: "bg-emerald-100 text-emerald-800",
  },
  [TrackingStatus.CANCEL]: {
    description: "ยกเลิกคิว",
    colorClass: "bg-rose-100 text-rose-700",
  },
};
