'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Save, X, Edit2, Layers, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { TableEmpty } from '@/components/ui/StateUI'

// ─── Table definitions ─────────────────────────────────────
type ColType = 'text' | 'number' | 'date' | 'select' | 'boolean' | 'readonly'

interface ColDef {
  key: string
  label: string
  type: ColType
  options?: string[]
  width?: number
}

interface TableDef {
  label: string
  table: string
  orderBy: string
  cols: ColDef[]
  group: string
}

const GROUPS = ['Core', 'Operations', 'Sales', 'Finance', 'Admin', 'Reconcile']

const TABLES: TableDef[] = [
  {
    label: 'Jobs', table: 'jobs', orderBy: 'order_date', group: 'Core',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 160 },
      { key: 'room_no', label: 'ห้อง', type: 'text', width: 90 },
      { key: 'customer_name', label: 'ลูกค้า', type: 'text', width: 140 },
      { key: 'project_id', label: 'Project ID', type: 'text', width: 120 },
      { key: 'customer_type', label: 'ประเภท', type: 'select', options: ['B2C', 'B2B'], width: 80 },
      { key: 'work_type', label: 'ประเภทงาน', type: 'text', width: 130 },
      { key: 'package_type', label: 'Package', type: 'text', width: 110 },
      { key: 'order_date', label: 'วันขาย', type: 'date', width: 120 },
      { key: 'revenue_ex_vat', label: 'มูลค่า (ex VAT)', type: 'number', width: 130 },
      { key: 'revenue_inc_vat', label: 'มูลค่า (inc VAT)', type: 'number', width: 130 },
      { key: 'cost', label: 'ต้นทุน', type: 'number', width: 110 },
      { key: 'working_status', label: 'สถานะงาน', type: 'select', options: ['กำลังดำเนินการ', 'ส่งมอบแล้ว', 'ยกเลิก'], width: 140 },
      { key: 'actual_deliver_date', label: 'วันส่งมอบ', type: 'date', width: 120 },
      { key: 'expected_finish_date', label: 'กำหนดเสร็จ', type: 'date', width: 120 },
      { key: 'sales_id', label: 'Sales ID', type: 'text', width: 100 },
      { key: 'payment_plan_type', label: 'แผนชำระ', type: 'text', width: 90 },
      { key: 'work_start_date', label: 'เริ่มงาน', type: 'date', width: 110 },
      { key: 'contract_date', label: 'วันทำสัญญา', type: 'date', width: 120 },
      { key: 'po_no', label: 'PO No', type: 'text', width: 100 },
      { key: 'so_no', label: 'SO No', type: 'text', width: 100 },
      { key: 'accounting_status', label: 'บัญชี', type: 'text', width: 100 },
      { key: 'delivery_lot', label: 'Lot ส่งมอบ', type: 'text', width: 100 },
      { key: 'notes', label: 'หมายเหตุ', type: 'text', width: 180 },
    ],
  },
  {
    label: 'Payments', table: 'payments', orderBy: 'created_at', group: 'Core',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 160 },
      { key: 'job_id', label: 'Job ID', type: 'text', width: 150 },
      { key: 'room', label: 'ห้อง', type: 'text', width: 90 },
      { key: 'project_id', label: 'Project ID', type: 'text', width: 120 },
      { key: 'installment_no', label: 'งวดที่', type: 'number', width: 70 },
      { key: 'installment_name', label: 'ชื่องวด', type: 'text', width: 180 },
      { key: 'percentage', label: '%', type: 'number', width: 70 },
      { key: 'amount', label: 'ยอด', type: 'number', width: 110 },
      { key: 'status', label: 'สถานะ', type: 'select', options: ['pending', 'paid', 'overdue'], width: 100 },
      { key: 'due_date', label: 'ครบกำหนด', type: 'date', width: 120 },
      { key: 'paid_date', label: 'วันรับเงิน', type: 'date', width: 120 },
      { key: 'paid_amount', label: 'รับจริง', type: 'number', width: 110 },
      { key: 'is_work_trigger', label: 'เริ่มงาน', type: 'boolean', width: 80 },
      { key: 'is_final', label: 'งวดสุดท้าย', type: 'boolean', width: 90 },
      { key: 'channel', label: 'ช่องทาง', type: 'text', width: 100 },
      { key: 'notes', label: 'หมายเหตุ', type: 'text', width: 180 },
    ],
  },
  {
    label: 'Customers', table: 'customers', orderBy: 'created_at', group: 'Core',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 130 },
      { key: 'customer_name', label: 'ชื่อลูกค้า', type: 'text', width: 150 },
      { key: 'phone', label: 'โทร', type: 'text', width: 120 },
      { key: 'email', label: 'Email', type: 'text', width: 160 },
      { key: 'project_name', label: 'โครงการ', type: 'text', width: 140 },
      { key: 'room_no', label: 'ห้อง', type: 'text', width: 90 },
      { key: 'status', label: 'สถานะ', type: 'text', width: 110 },
      { key: 'assigned_to', label: 'มอบหมายให้', type: 'text', width: 120 },
      { key: 'source', label: 'แหล่งที่มา', type: 'text', width: 110 },
      { key: 'work_type', label: 'ประเภทงาน', type: 'text', width: 120 },
      { key: 'customer_type', label: 'ประเภทลูกค้า', type: 'select', options: ['B2C', 'B2B'], width: 110 },
      { key: 'sale_revenue', label: 'มูลค่า', type: 'number', width: 110 },
      { key: 'close_date', label: 'วันปิดงาน', type: 'date', width: 120 },
      { key: 'notes', label: 'หมายเหตุ', type: 'text', width: 180 },
    ],
  },
  {
    label: 'Projects', table: 'projects', orderBy: 'name', group: 'Core',
    cols: [
      { key: 'id', label: 'ID', type: 'text', width: 120 },
      { key: 'name', label: 'ชื่อโครงการ', type: 'text', width: 180 },
      { key: 'developer', label: 'Developer', type: 'text', width: 140 },
      { key: 'location', label: 'ที่ตั้ง', type: 'text', width: 150 },
      { key: 'tower_count', label: 'อาคาร', type: 'number', width: 80 },
      { key: 'total_units', label: 'ห้องทั้งหมด', type: 'number', width: 100 },
      { key: 'active', label: 'Active', type: 'boolean', width: 80 },
      { key: 'notes', label: 'หมายเหตุ', type: 'text', width: 200 },
    ],
  },
  {
    label: 'Warranties', table: 'warranties', orderBy: 'warranty_end', group: 'Operations',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 140 },
      { key: 'room', label: 'ห้อง', type: 'text', width: 90 },
      { key: 'project_id', label: 'Project ID', type: 'text', width: 120 },
      { key: 'customer_id', label: 'Customer ID', type: 'text', width: 130 },
      { key: 'handover_date', label: 'วันส่งมอบ', type: 'date', width: 120 },
      { key: 'warranty_start', label: 'เริ่มประกัน', type: 'date', width: 120 },
      { key: 'warranty_end', label: 'หมดประกัน', type: 'date', width: 120 },
      { key: 'warranty_months', label: 'เดือน', type: 'number', width: 80 },
      { key: 'status', label: 'สถานะ', type: 'select', options: ['active', 'expired', 'voided'], width: 100 },
      { key: 'notes', label: 'หมายเหตุ', type: 'text', width: 180 },
    ],
  },
  {
    label: 'Users', table: 'users', orderBy: 'name', group: 'Admin',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 130 },
      { key: 'name', label: 'ชื่อ', type: 'text', width: 140 },
      { key: 'email', label: 'Email', type: 'text', width: 180 },
      { key: 'role', label: 'Role', type: 'select', options: ['sales', 'sales_mgr', 'admin', 'admin_sales', 'qc', 'finance', 'executive'], width: 120 },
      { key: 'level', label: 'Level', type: 'text', width: 90 },
      { key: 'dept', label: 'Dept', type: 'text', width: 90 },
      { key: 'active', label: 'Active', type: 'boolean', width: 80 },
    ],
  },
  {
    label: 'Handovers', table: 'handovers', orderBy: 'handover_date', group: 'Operations',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 150 },
      { key: 'job_id', label: 'Job ID', type: 'text', width: 150 },
      { key: 'customer_id', label: 'Customer ID', type: 'text', width: 140 },
      { key: 'project_id', label: 'Project ID', type: 'text', width: 130 },
      { key: 'room', label: 'ห้อง', type: 'text', width: 90 },
      { key: 'handover_date', label: 'วันส่งมอบ', type: 'date', width: 120 },
      { key: 'delivery_date', label: 'Delivery Date', type: 'date', width: 120 },
      { key: 'status', label: 'สถานะ', type: 'text', width: 100 },
      { key: 'work_status', label: 'สถานะงาน', type: 'text', width: 120 },
      { key: 'job_start_date', label: 'เริ่มงาน', type: 'date', width: 110 },
      { key: 'expected_completion', label: 'กำหนดเสร็จ', type: 'date', width: 120 },
      { key: 'work_days', label: 'วันทำงาน', type: 'number', width: 90 },
      { key: 'total_amount', label: 'ยอดรวม', type: 'number', width: 120 },
      { key: 'final_payment_date', label: 'รับเงินสุดท้าย', type: 'date', width: 130 },
      { key: 'warranty_days', label: 'ประกัน (วัน)', type: 'number', width: 100 },
      { key: 'warranty_end', label: 'หมดประกัน', type: 'date', width: 120 },
      { key: 'defect_noted', label: 'มีข้อบกพร่อง', type: 'boolean', width: 110 },
      { key: 'defect_details', label: 'รายละเอียดข้อบกพร่อง', type: 'text', width: 180 },
      { key: 'commission_triggered', label: 'Commission', type: 'boolean', width: 110 },
      { key: 'client_type', label: 'ประเภทลูกค้า', type: 'text', width: 120 },
      { key: 'sales_sign_date', label: 'วันเซ็น (Sales)', type: 'date', width: 130 },
      { key: 'customer_sign_date', label: 'วันเซ็น (ลูกค้า)', type: 'date', width: 130 },
      { key: 'notes', label: 'หมายเหตุ', type: 'text', width: 180 },
    ],
  },
  {
    label: 'Events', table: 'events', orderBy: 'event_date', group: 'Sales',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 150 },
      { key: 'event_name', label: 'ชื่ออีเวนต์', type: 'text', width: 200 },
      { key: 'event_type', label: 'ประเภท', type: 'text', width: 120 },
      { key: 'event_date', label: 'วันที่', type: 'date', width: 120 },
      { key: 'location', label: 'สถานที่', type: 'text', width: 150 },
      { key: 'project_id', label: 'Project ID', type: 'text', width: 130 },
      { key: 'project_name', label: 'โครงการ', type: 'text', width: 150 },
      { key: 'total_attendees', label: 'ผู้เข้าร่วม', type: 'number', width: 110 },
      { key: 'line_adds', label: 'Add LINE', type: 'number', width: 90 },
      { key: 'created_by', label: 'บันทึกโดย', type: 'text', width: 120 },
      { key: 'notes', label: 'หมายเหตุ', type: 'text', width: 200 },
    ],
  },
  {
    label: 'Event Customers', table: 'event_customers', orderBy: 'created_at', group: 'Sales',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 150 },
      { key: 'event_id', label: 'Event ID', type: 'text', width: 140 },
      { key: 'customer_name', label: 'ชื่อลูกค้า', type: 'text', width: 150 },
      { key: 'phone', label: 'โทร', type: 'text', width: 120 },
      { key: 'email', label: 'Email', type: 'text', width: 160 },
      { key: 'project_id', label: 'Project ID', type: 'text', width: 130 },
      { key: 'interested_project_id', label: 'สนใจโครงการ', type: 'text', width: 130 },
      { key: 'room_no', label: 'ห้อง', type: 'text', width: 90 },
      { key: 'interested_room', label: 'ห้องที่สนใจ', type: 'text', width: 110 },
      { key: 'sales_id', label: 'Sales ID', type: 'text', width: 100 },
      { key: 'status', label: 'สถานะ', type: 'text', width: 100 },
      { key: 'booking_type', label: 'ประเภทจอง', type: 'text', width: 110 },
      { key: 'booked_date', label: 'วันจอง', type: 'date', width: 110 },
      { key: 'booked_value', label: 'มูลค่าจอง', type: 'number', width: 120 },
      { key: 'deposit_amount', label: 'มัดจำ', type: 'number', width: 100 },
      { key: 'line_added', label: 'Add LINE', type: 'boolean', width: 90 },
      { key: 'converted_to_customer_id', label: 'Customer ID', type: 'text', width: 130 },
      { key: 'lead_id', label: 'Lead ID', type: 'text', width: 100 },
      { key: 'notes', label: 'หมายเหตุ', type: 'text', width: 180 },
    ],
  },
  {
    label: 'Commissions', table: 'commissions', orderBy: 'created_at', group: 'Finance',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 150 },
      { key: 'sales_person_id', label: 'Sales ID', type: 'text', width: 130 },
      { key: 'customer_id', label: 'Customer ID', type: 'text', width: 140 },
      { key: 'project_id', label: 'Project ID', type: 'text', width: 130 },
      { key: 'room', label: 'ห้อง', type: 'text', width: 90 },
      { key: 'sale_price', label: 'ราคาขาย', type: 'number', width: 130 },
      { key: 'commission_rate', label: 'อัตรา (%)', type: 'number', width: 100 },
      { key: 'commission_amount', label: 'Commission', type: 'number', width: 130 },
      { key: 'bonus', label: 'Bonus', type: 'number', width: 110 },
      { key: 'total_commission', label: 'รวม Commission', type: 'number', width: 140 },
      { key: 'status', label: 'สถานะ', type: 'select', options: ['pending', 'approved', 'paid'], width: 110 },
      { key: 'paid_date', label: 'วันจ่าย', type: 'date', width: 110 },
      { key: 'notes', label: 'หมายเหตุ', type: 'text', width: 180 },
    ],
  },
  {
    label: 'Commission Settings', table: 'commission_settings', orderBy: 'sort_order', group: 'Finance',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 80 },
      { key: 'tier_name', label: 'Tier', type: 'text', width: 150 },
      { key: 'revenue_min', label: 'รายได้ขั้นต่ำ', type: 'number', width: 130 },
      { key: 'revenue_max', label: 'รายได้สูงสุด', type: 'number', width: 130 },
      { key: 'rate', label: 'อัตรา (%)', type: 'number', width: 100 },
      { key: 'sort_order', label: 'ลำดับ', type: 'number', width: 80 },
      { key: 'active', label: 'Active', type: 'boolean', width: 80 },
    ],
  },
  {
    label: 'Condo Leads', table: 'condo_leads', orderBy: 'booking_date', group: 'Sales',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 80 },
      { key: 'customer_id', label: 'Customer ID', type: 'text', width: 140 },
      { key: 'customer_name', label: 'ชื่อลูกค้า', type: 'text', width: 150 },
      { key: 'phone', label: 'โทร', type: 'text', width: 120 },
      { key: 'email', label: 'Email', type: 'text', width: 160 },
      { key: 'project_id', label: 'Project ID', type: 'text', width: 130 },
      { key: 'tower', label: 'ตึก', type: 'text', width: 80 },
      { key: 'room_no', label: 'ห้อง', type: 'text', width: 90 },
      { key: 'model_id', label: 'Model ID', type: 'text', width: 100 },
      { key: 'model_name', label: 'ชื่อแบบ', type: 'text', width: 130 },
      { key: 'contract_price', label: 'ราคาสัญญา', type: 'number', width: 130 },
      { key: 's00_budget', label: 'งบ S00', type: 'number', width: 110 },
      { key: 'total_payment', label: 'รับเงินรวม', type: 'number', width: 120 },
      { key: 'booking_date', label: 'วันจอง', type: 'date', width: 110 },
      { key: 'transfer_date', label: 'วันโอน', type: 'date', width: 110 },
      { key: 'origin_sales', label: 'Sales (ต้นสังกัด)', type: 'text', width: 140 },
      { key: 'consent', label: 'Consent', type: 'text', width: 100 },
    ],
  },
  {
    label: 'Documents', table: 'documents', orderBy: 'created_at', group: 'Operations',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 150 },
      { key: 'customer_id', label: 'Customer ID', type: 'text', width: 140 },
      { key: 'doc_name', label: 'ชื่อเอกสาร', type: 'text', width: 180 },
      { key: 'doc_type', label: 'ประเภท', type: 'text', width: 120 },
      { key: 'file_url', label: 'URL', type: 'text', width: 200 },
      { key: 'issued_date', label: 'วันออก', type: 'date', width: 110 },
      { key: 'expiry_date', label: 'วันหมดอายุ', type: 'date', width: 120 },
      { key: 'status', label: 'สถานะ', type: 'text', width: 100 },
      { key: 'notes', label: 'หมายเหตุ', type: 'text', width: 180 },
    ],
  },
  {
    label: 'Finance Entries', table: 'finance_entries', orderBy: 'entry_date', group: 'Finance',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 80 },
      { key: 'type', label: 'ประเภท', type: 'select', options: ['income', 'expense'], width: 100 },
      { key: 'category', label: 'หมวดหมู่', type: 'text', width: 130 },
      { key: 'amount', label: 'จำนวนเงิน', type: 'number', width: 120 },
      { key: 'entry_date', label: 'วันที่', type: 'date', width: 110 },
      { key: 'description', label: 'รายละเอียด', type: 'text', width: 200 },
      { key: 'ref_id', label: 'Ref ID', type: 'text', width: 130 },
      { key: 'created_by', label: 'บันทึกโดย', type: 'text', width: 120 },
    ],
  },
  {
    label: 'Org Targets', table: 'org_targets', orderBy: 'year', group: 'Admin',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 150 },
      { key: 'year', label: 'ปี', type: 'number', width: 80 },
      { key: 'month', label: 'เดือน', type: 'number', width: 80 },
      { key: 'target_sales_value', label: 'เป้าขาย', type: 'number', width: 130 },
      { key: 'target_delivery_value', label: 'เป้าส่งมอบ', type: 'number', width: 130 },
    ],
  },
  {
    label: 'Sales Targets', table: 'sales_targets', orderBy: 'year', group: 'Admin',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 150 },
      { key: 'user_id', label: 'User ID', type: 'text', width: 130 },
      { key: 'project_id', label: 'Project ID', type: 'text', width: 130 },
      { key: 'year', label: 'ปี', type: 'number', width: 80 },
      { key: 'month', label: 'เดือน', type: 'number', width: 80 },
      { key: 'working_days', label: 'วันทำงาน', type: 'number', width: 90 },
      { key: 'target_calls', label: 'เป้าโทร', type: 'number', width: 90 },
      { key: 'target_visits', label: 'เป้าเยี่ยม', type: 'number', width: 90 },
      { key: 'target_leads', label: 'เป้า Leads', type: 'number', width: 100 },
      { key: 'target_prospects', label: 'เป้า Prospects', type: 'number', width: 120 },
      { key: 'target_quotations', label: 'เป้าใบเสนอ', type: 'number', width: 110 },
      { key: 'target_quotation_value', label: 'เป้ามูลค่าใบเสนอ', type: 'number', width: 150 },
      { key: 'target_bookings', label: 'เป้าจอง', type: 'number', width: 100 },
      { key: 'target_booking_value', label: 'เป้ามูลค่าจอง', type: 'number', width: 140 },
      { key: 'target_closed', label: 'เป้าปิดงาน', type: 'number', width: 110 },
      { key: 'target_sales_value', label: 'เป้าขาย', type: 'number', width: 110 },
      { key: 'target_delivery_value', label: 'เป้าส่งมอบ', type: 'number', width: 120 },
      { key: 'target_revenue', label: 'เป้ารายได้', type: 'number', width: 110 },
    ],
  },
  {
    label: 'Payment Followups', table: 'payment_followups', orderBy: 'created_at', group: 'Operations',
    cols: [
      { key: 'id', label: 'ID', type: 'readonly', width: 150 },
      { key: 'payment_id', label: 'Payment ID', type: 'text', width: 150 },
      { key: 'note', label: 'หมายเหตุ', type: 'text', width: 220 },
      { key: 'followed_by', label: 'บันทึกโดย', type: 'text', width: 130 },
    ],
  },
]

// ─── Cell renderer ─────────────────────────────────────────
function CellInput({ col, value, onChange }: {
  col: ColDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  const inputStyle = {
    width: '100%',
    background: 'var(--input-bg)',
    border: '1px solid var(--accent)',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 12,
    color: 'var(--text-1)',
    outline: 'none',
  }

  if (col.type === 'select' && col.options) {
    return (
      <select value={String(value ?? '')} onChange={e => onChange(e.target.value)}
        className="field-input" style={{ padding: '2px 6px', fontSize: 12, height: 26 }}>
        <option value="">—</option>
        {col.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (col.type === 'boolean') {
    return (
      <select value={value === true ? 'true' : value === false ? 'false' : ''} onChange={e => onChange(e.target.value === 'true')}
        className="field-input" style={{ padding: '2px 6px', fontSize: 12, height: 26 }}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }
  return (
    <input
      type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
      value={String(value ?? '')}
      onChange={e => onChange(col.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
      style={inputStyle}
    />
  )
}

function CellDisplay({ col, value }: { col: ColDef; value: unknown }) {
  if (value === null || value === undefined || value === '') return <span style={{ color: 'var(--text-3)' }}>—</span>
  if (col.type === 'boolean') return <span style={{ color: value ? 'var(--accent-green)' : 'var(--text-3)' }}>{value ? 'Yes' : 'No'}</span>
  if (col.type === 'number') return <span>{Number(value).toLocaleString('th-TH')}</span>
  if (col.type === 'date') {
    try { return <span>{new Date(String(value)).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}</span> }
    catch { return <span>{String(value)}</span> }
  }
  const str = String(value)
  return <span title={str} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '100%' }}>{str}</span>
}

// ─── Bulk Edit Modal ───────────────────────────────────────
function BulkEditModal({ cols, count, onApply, onClose }: {
  cols: ColDef[]
  count: number
  onApply: (col: string, value: unknown) => void
  onClose: () => void
}) {
  const editableCols = cols.filter(c => c.type !== 'readonly')
  const [col, setCol] = useState(editableCols[0]?.key || '')
  const [val, setVal] = useState<unknown>('')
  const selectedCol = editableCols.find(c => c.key === col)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>Bulk Edit</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{count} แถวที่เลือก</p>
          </div>
          <button onClick={onClose} className="p-1" style={{ color: 'var(--text-2)' }}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Field ที่ต้องการเปลี่ยน</label>
            <select value={col} onChange={e => { setCol(e.target.value); setVal('') }}
              className="field-input">
              {editableCols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          {selectedCol && (
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>ค่าใหม่</label>
              <div className="rounded-[8px] px-3 py-2" style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)' }}>
                <CellInput col={selectedCol} value={val} onChange={setVal} />
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-[8px] text-sm border"
              style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>ยกเลิก</button>
            <button onClick={() => { onApply(col, val); onClose() }}
              className="flex-1 py-2.5 rounded-[8px] text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}>
              อัปเดต {count} แถว
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Reconcile Check ───────────────────────────────────────
const fmtN = (n: number) => n.toLocaleString('th-TH')
const fmtB = (n: number) => '฿' + Math.round(n).toLocaleString('th-TH')

interface CheckItem {
  label: string
  desc: string
  lhs: { label: string; value: number }
  rhs: { label: string; value: number }
  pass: boolean
  detail?: string
  issues?: { id: string; name: string; diff: number }[]
}

function ReconcileCheck() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [checks, setChecks] = useState<CheckItem[]>([])
  const [ran, setRan] = useState(false)

  async function run() {
    setLoading(true)
    const [
      { data: customers },
      { data: jobs },
      { data: payments },
    ] = await Promise.all([
      supabase.from('customers').select('id, status'),
      supabase.from('jobs').select('id, customer_id, working_status, revenue_inc_vat'),
      supabase.from('payments').select('id, job_id, amount, paid_amount, status, is_work_trigger'),
    ])

    const c = (customers || []) as { id: string; status: string }[]
    const j = (jobs || []) as { id: string; customer_id: string; working_status: string; revenue_inc_vat: number }[]
    const p = (payments || []) as { id: string; job_id: string; amount: number; paid_amount: number | null; status: string; is_work_trigger: boolean }[]

    // Check 1: customers total = all statuses
    const cTotal = c.length
    const cLost = c.filter(x => x.status === 'lost').length
    const cCancelled = c.filter(x => x.status === 'cancelled').length
    const cActive = c.filter(x => !['lost', 'cancelled'].includes(x.status)).length
    const check1: CheckItem = {
      label: 'จำนวนลูกค้า',
      desc: 'Active + Lost + Cancelled = ทั้งหมด',
      lhs: { label: 'Active + Lost + Cancelled', value: cActive + cLost + cCancelled },
      rhs: { label: 'Customers ทั้งหมด', value: cTotal },
      pass: cActive + cLost + cCancelled === cTotal,
    }

    // Check 2: jobs working_status breakdown = total
    const jTotal = j.length
    const jWorking = j.filter(x => x.working_status === 'ดำเนินการ').length
    const jBooked = j.filter(x => x.working_status === 'จอง').length
    const jDelivered = j.filter(x => x.working_status === 'ส่งมอบแล้ว').length
    const jCancelled = j.filter(x => x.working_status === 'ยกเลิก').length
    const jOther = j.filter(x => !['ดำเนินการ', 'จอง', 'ส่งมอบแล้ว', 'ยกเลิก'].includes(x.working_status)).length
    const jSum = jWorking + jBooked + jDelivered + jCancelled + jOther
    const check2: CheckItem = {
      label: 'จำนวนงาน',
      desc: 'ดำเนินการ + จอง + ส่งมอบแล้ว + ยกเลิก + อื่นๆ = ทั้งหมด',
      lhs: { label: `ดำเนินการ(${jWorking}) + จอง(${jBooked}) + ส่งมอบ(${jDelivered}) + ยกเลิก(${jCancelled}) + อื่น(${jOther})`, value: jSum },
      rhs: { label: 'Jobs ทั้งหมด', value: jTotal },
      pass: jSum === jTotal,
    }

    // Check 3: jobs ที่ดำเนินการอยู่ต้องมี customers.status='closed'
    const jobsActive = j.filter(x => x.working_status === 'ดำเนินการ')
    const customerStatusMap = Object.fromEntries(c.map(x => [x.id, x.status]))
    const mismatchedJobs = jobsActive.filter(x => x.customer_id && customerStatusMap[x.customer_id] !== 'closed')
    const check3: CheckItem = {
      label: 'Sync jobs ↔ customers',
      desc: 'jobs.working_status=ดำเนินการ ต้องมี customers.status=closed',
      lhs: { label: 'Jobs ที่ sync แล้ว', value: jobsActive.length - mismatchedJobs.length },
      rhs: { label: 'Jobs ดำเนินการทั้งหมด', value: jobsActive.length },
      pass: mismatchedJobs.length === 0,
      detail: mismatchedJobs.length > 0 ? `พบ ${mismatchedJobs.length} jobs ที่ working_status=ดำเนินการ แต่ customer ยังไม่ closed` : undefined,
    }

    // Check 4: มูลค่างาน vs ยอดงวดรวม (เฉพาะ jobs ที่ส่งมอบแล้ว หรือ ดำเนินการ)
    const activeJobs = j.filter(x => x.working_status === 'ส่งมอบแล้ว' || x.working_status === 'ดำเนินการ')
    const activeJobIds = new Set(activeJobs.map(x => x.id))
    const totalJobRevenue = activeJobs.reduce((s, x) => s + (x.revenue_inc_vat || 0), 0)
    const paymentsByJob = p.filter(x => activeJobIds.has(x.job_id))
    const totalPaymentAmount = paymentsByJob.reduce((s, x) => s + (x.amount || 0), 0)
    // find jobs where sum(payments.amount) != revenue_inc_vat
    const paymentSumByJob: Record<string, number> = {}
    for (const pay of paymentsByJob) {
      paymentSumByJob[pay.job_id] = (paymentSumByJob[pay.job_id] || 0) + (pay.amount || 0)
    }
    const jobsWithMismatch = activeJobs.filter(x => {
      const pSum = paymentSumByJob[x.id] || 0
      return pSum > 0 && Math.abs(pSum - (x.revenue_inc_vat || 0)) > 1
    })
    const check4: CheckItem = {
      label: 'มูลค่างาน vs ยอดงวดรวม',
      desc: 'SUM(jobs.revenue_inc_vat) ≈ SUM(payments.amount) เฉพาะ jobs ที่ดำเนินการ/ส่งมอบแล้ว',
      lhs: { label: 'SUM(jobs.revenue_inc_vat)', value: totalJobRevenue },
      rhs: { label: 'SUM(payments.amount)', value: totalPaymentAmount },
      pass: Math.abs(totalJobRevenue - totalPaymentAmount) < 10,
      detail: jobsWithMismatch.length > 0 ? `พบ ${jobsWithMismatch.length} jobs ที่ยอดงวดไม่ตรงกับมูลค่างาน` : undefined,
    }

    // Check 5: jobs ดำเนินการ ต้องมี trigger payment ที่ paid
    const triggerPaidJobIds = new Set(p.filter(x => x.is_work_trigger && x.status === 'paid').map(x => x.job_id))
    const jobsNoTrigger = jobsActive.filter(x => !triggerPaidJobIds.has(x.id))
    const check5: CheckItem = {
      label: 'Trigger payment',
      desc: 'ทุก job ดำเนินการ ต้องมีงวด trigger ที่จ่ายแล้ว',
      lhs: { label: 'Jobs ที่มี trigger paid', value: jobsActive.length - jobsNoTrigger.length },
      rhs: { label: 'Jobs ดำเนินการทั้งหมด', value: jobsActive.length },
      pass: jobsNoTrigger.length === 0,
      detail: jobsNoTrigger.length > 0 ? `พบ ${jobsNoTrigger.length} jobs ที่ไม่มีงวด trigger ที่จ่ายแล้ว` : undefined,
    }

    setChecks([check1, check2, check3, check4, check5])
    setRan(true)
    setLoading(false)
  }

  const passCount = checks.filter(c => c.pass).length

  return (
    <div className="flex-1 overflow-auto mx-5 mb-5">
      <div className="max-w-2xl mx-auto pt-6 pb-10 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>Reconcile Check</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>ตรวจความสอดคล้องของข้อมูลระหว่าง customers / jobs / payments</p>
          </div>
          <button onClick={run} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] text-sm font-semibold text-white"
            style={{ background: loading ? '#666' : 'var(--accent)' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'กำลังตรวจ...' : ran ? 'ตรวจอีกครั้ง' : 'เริ่มตรวจ'}
          </button>
        </div>

        {/* Summary badge */}
        {ran && !loading && (
          <div className="px-4 py-3 rounded-[11px] flex items-center gap-3"
            style={{ background: passCount === checks.length ? 'color-mix(in srgb, var(--accent-green) 8%, transparent)' : 'color-mix(in srgb, var(--accent-orange) 8%, transparent)', border: `1px solid ${passCount === checks.length ? 'color-mix(in srgb, var(--accent-green) 30%, transparent)' : 'color-mix(in srgb, var(--accent-orange) 30%, transparent)'}` }}>
            {passCount === checks.length
              ? <CheckCircle2 size={16} className="text-success flex-shrink-0" />
              : <AlertTriangle size={16} className="text-warning flex-shrink-0" />}
            <span className="text-sm font-semibold" style={{ color: passCount === checks.length ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
              {passCount === checks.length ? 'ข้อมูลสอดคล้องทั้งหมด ✓' : `ผ่าน ${passCount}/${checks.length} — พบความไม่สอดคล้อง ${checks.length - passCount} รายการ`}
            </span>
          </div>
        )}

        {/* Check items */}
        {ran && !loading && checks.map((item, i) => (
          <div key={i} className="rounded-[11px] p-4 space-y-3"
            style={{ background: 'var(--card-bg)', border: `1px solid ${item.pass ? 'var(--card-border)' : 'color-mix(in srgb, var(--accent-orange) 40%, transparent)'}` }}>
            <div className="flex items-start gap-2.5">
              {item.pass
                ? <CheckCircle2 size={15} className="text-success mt-0.5 flex-shrink-0" />
                : <XCircle size={15} className="text-warning mt-0.5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{item.label}</span>
                  <span className="text-micro px-1.5 py-0.5 rounded-[4px] font-semibold"
                    style={{ background: item.pass ? 'color-mix(in srgb, var(--accent-green) 12%, transparent)' : 'color-mix(in srgb, var(--accent-orange) 12%, transparent)', color: item.pass ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                    {item.pass ? 'PASS' : 'FAIL'}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{item.desc}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 ml-6">
              <div className="rounded-[8px] px-3 py-2.5" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>{item.lhs.label}</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                  {item.lhs.value > 9999 ? fmtB(item.lhs.value) : fmtN(item.lhs.value)}
                </p>
              </div>
              <div className="rounded-[8px] px-3 py-2.5" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>{item.rhs.label}</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                  {item.rhs.value > 9999 ? fmtB(item.rhs.value) : fmtN(item.rhs.value)}
                </p>
              </div>
            </div>
            {item.detail && (
              <p className="ml-6 text-xs px-3 py-2 rounded-[8px]" style={{ background: 'color-mix(in srgb, var(--accent-orange) 8%, transparent)', color: 'var(--accent-orange)' }}>
                ⚠ {item.detail}
              </p>
            )}
          </div>
        ))}

        {!ran && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: 'var(--text-3)' }}>
            <CheckCircle2 size={32} className="opacity-30" />
            <p className="text-sm">กดปุ่ม "เริ่มตรวจ" เพื่อ verify ข้อมูล</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Password Gate ─────────────────────────────────────────
function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(false)
  function attempt() {
    if (pw === 'Wyde2026') { onUnlock() }
    else { setErr(true); setPw('') }
  }
  return (
    <div className="h-screen flex items-center justify-center" style={{ background: 'var(--page-bg)' }}>
      <div className="w-80 rounded-[16px] p-8 shadow-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-center gap-2 mb-6">
          <AlertTriangle size={18} className="text-value" />
          <h2 className="font-bold text-base" style={{ color: 'var(--text-1)' }}>Admin Data Entry</h2>
        </div>
        <p className="text-xs mb-5" style={{ color: 'var(--text-2)' }}>หน้านี้ต้องใช้รหัสผ่านเพื่อเข้าถึง</p>
        <input
          type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(false) }}
          onKeyDown={e => e.key === 'Enter' && attempt()}
          placeholder="รหัสผ่าน"
          autoFocus
          className="w-full px-4 py-2.5 rounded-[8px] text-sm mb-3 outline-none"
          style={{ background: 'var(--input-bg)', border: `1px solid ${err ? 'var(--accent-red)' : 'var(--divider)'}`, color: 'var(--text-1)' }}
        />
        {err && <p className="text-xs text-danger mb-3">รหัสผ่านไม่ถูกต้อง</p>}
        <button onClick={attempt} className="w-full py-2.5 rounded-[8px] text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
          เข้าสู่ระบบ
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function AdminDataPage() {
  const supabase = createClient()
  const [unlocked, setUnlocked] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [activeGroup, setActiveGroup] = useState('Core')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [editingRow, setEditingRow] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkModal, setBulkModal] = useState(false)
  const [savedRows, setSavedRows] = useState<Set<string>>(new Set())

  const tableDef = TABLES[activeTab]
  const hasProjectFilter = tableDef.cols.some(c => c.key === 'project_id')

  const load = useCallback(async () => {
    setLoading(true)
    setEditingRow(null)
    setSelectedIds(new Set())
    const { data } = await supabase
      .from(tableDef.table)
      .select('*')
      .order(tableDef.orderBy, { ascending: false })
      .limit(500)
    setRows(data || [])
    setLoading(false)
  }, [activeTab])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name').then(({ data }) => setProjects(data || []))
  }, [])

  const filtered = useMemo(() => {
    let list = rows
    if (filterProject && hasProjectFilter) {
      list = list.filter(r => r['project_id'] === filterProject)
    }
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(r =>
      tableDef.cols.some(c => {
        const v = r[c.key]
        return v !== null && v !== undefined && String(v).toLowerCase().includes(q)
      })
    )
  }, [rows, search, filterProject, hasProjectFilter, tableDef])

  function startEdit(row: Record<string, unknown>) {
    setEditingRow(String(row.id))
    setEditValues({ ...row })
  }

  function cancelEdit() {
    setEditingRow(null)
    setEditValues({})
  }

  async function saveRow() {
    if (!editingRow) return
    setSaving(true)
    const updates: Record<string, unknown> = {}
    for (const col of tableDef.cols) {
      if (col.type !== 'readonly') {
        updates[col.key] = editValues[col.key] === '' ? null : editValues[col.key]
      }
    }
    // ป้องกัน: ห้าม set ส่งมอบแล้ว โดยไม่มีวันส่งมอบ
    if (updates['working_status'] === 'ส่งมอบแล้ว' && !updates['actual_deliver_date']) {
      const currentRow = rows.find(r => String(r.id) === editingRow)
      if (!currentRow?.actual_deliver_date) {
        alert('ไม่สามารถตั้งสถานะ "ส่งมอบแล้ว" ได้\nกรุณากรอก "วันส่งมอบ" ก่อน หรือกดปุ่มส่งมอบใน My Deals แทน')
        setSaving(false)
        return
      }
    }
    const { error } = await supabase.from(tableDef.table).update(updates).eq('id', editingRow)
    if (!error) {
      setSavedRows(prev => new Set([...prev, editingRow]))
      setRows(prev => prev.map(r => String(r.id) === editingRow ? { ...r, ...updates } : r))
      setTimeout(() => setSavedRows(prev => { const s = new Set(prev); s.delete(editingRow); return s }), 2000)
    }
    setSaving(false)
    setEditingRow(null)
    setEditValues({})
  }

  async function applyBulkEdit(colKey: string, value: unknown) {
    const ids = Array.from(selectedIds)
    const updates = { [colKey]: value === '' ? null : value }
    // ป้องกัน: ห้าม bulk set ส่งมอบแล้ว โดยไม่มีวันส่งมอบ
    if (colKey === 'working_status' && value === 'ส่งมอบแล้ว') {
      const missing = rows.filter(r => ids.includes(String(r.id)) && !r.actual_deliver_date)
      if (missing.length > 0) {
        alert(`ไม่สามารถตั้งสถานะ "ส่งมอบแล้ว" ได้\nพบ ${missing.length} งานที่ไม่มีวันส่งมอบ: ${missing.map(r => r.room_no).join(', ')}\nกรุณากรอกวันส่งมอบก่อน หรือใช้ปุ่มส่งมอบใน My Deals`)
        return
      }
    }
    await supabase.from(tableDef.table).update(updates).in('id', ids)
    setRows(prev => prev.map(r => selectedIds.has(String(r.id)) ? { ...r, ...updates } : r))
    setSelectedIds(new Set())
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(r => String(r.id))))
  }

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />

  const isReconcile = activeGroup === 'Reconcile'

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--page-bg)' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-page-title flex-1" style={{ color: 'var(--text-1)' }}>{isReconcile ? 'Reconcile Check' : 'Data Entry'}</h1>
          {!isReconcile && (<>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..."
                className="field-input pl-8 pr-7 w-44" />
              {search && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
                  <X size={12} style={{ color: 'var(--text-3)' }} />
                </button>
              )}
            </div>
            <button onClick={load} className="btn-util text-xs">รีเฟรช</button>
          </>)}
        </div>

        {/* Project filter (only for tables with project_id) */}
        {!isReconcile && hasProjectFilter && (
          <div className="flex items-center gap-2 mb-3">
            <label className="field-label">โครงการ</label>
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
              className="field-input" style={{ width: 'auto', minWidth: 160 }}>
              <option value="">ทั้งหมด</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {filterProject && (
              <button onClick={() => setFilterProject('')} className="btn-util text-xs">✕ ล้าง</button>
            )}
          </div>
        )}

        {/* Tabs — Finance style: group row + table row */}
        <div className="space-y-2">
          {/* Row 1: group selector */}
          <div className="flex gap-1 rounded-[11px] p-1 w-fit" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
            {GROUPS.map(grp => (
              <button key={grp} onClick={() => {
                setActiveGroup(grp)
                const first = TABLES.findIndex(t => t.group === grp)
                if (first !== -1) { setActiveTab(first); setSearch(''); setFilterProject('') }
              }}
                className="px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-colors"
                style={{ background: activeGroup === grp ? 'var(--accent)' : 'transparent', color: activeGroup === grp ? '#fff' : 'var(--text-2)' }}>
                {grp}
              </button>
            ))}
          </div>
          {/* Row 2: table selector for active group */}
          <div className="flex gap-1 flex-wrap">
            {TABLES.map((t, i) => t.group !== activeGroup ? null : (
              <button key={t.table} onClick={() => { setActiveTab(i); setSearch(''); setFilterProject('') }}
                className="px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-colors"
                style={activeTab === i
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reconcile view */}
      {isReconcile && <ReconcileCheck />}

      {/* Bulk action bar */}
      {!isReconcile && selectedIds.size > 0 && (
        <div className="flex-shrink-0 mx-5 mb-2 px-4 py-2.5 rounded-[8px] flex items-center gap-3"
          style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
          <Layers size={14} className="text-indigo-400" />
          <span className="text-sm font-semibold text-indigo-400">{selectedIds.size} แถวที่เลือก</span>
          <div className="flex-1" />
          <button onClick={() => setBulkModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold text-white"
            style={{ background: 'var(--accent)' }}>
            <Edit2 size={12} /> Bulk Edit
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="text-xs px-3 py-1.5 rounded-[8px]"
            style={{ color: 'var(--text-3)', border: '1px solid var(--divider)' }}>
            ยกเลิก
          </button>
        </div>
      )}

      {/* Table */}
      {!isReconcile && <div className="flex-1 overflow-auto mx-5 mb-5 rounded-[11px]"
        style={{ border: '1px solid var(--card-border)', background: 'var(--card-bg)', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
          </div>
        ) : (
          <table className="text-xs" style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--hover-bg)', position: 'sticky', top: 0, zIndex: 10 }}>
                {/* Checkbox */}
                <th style={{ width: 36, padding: '8px 10px', borderBottom: '1px solid var(--divider)', textAlign: 'center', position: 'sticky', left: 0, background: 'var(--hover-bg)' }}>
                  <input type="checkbox"
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
                {/* Actions */}
                <th style={{ width: 70, padding: '8px 8px', borderBottom: '1px solid var(--divider)', color: 'var(--text-3)', fontWeight: 500, position: 'sticky', left: 36, background: 'var(--hover-bg)' }}>
                  Actions
                </th>
                {tableDef.cols.map(col => (
                  <th key={col.key}
                    style={{ width: col.width || 120, minWidth: col.width || 120, padding: '8px 10px', borderBottom: '1px solid var(--divider)', textAlign: 'left', color: 'var(--text-3)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <TableEmpty colSpan={tableDef.cols.length + 2} icon={Search} message="ไม่พบข้อมูล" />
              ) : filtered.map((row, ri) => {
                const id = String(row.id)
                const isEditing = editingRow === id
                const isSelected = selectedIds.has(id)
                const wasSaved = savedRows.has(id)
                const rowBg = wasSaved ? 'color-mix(in srgb, var(--accent-green) 6%, transparent)' : isEditing ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : isSelected ? 'color-mix(in srgb, var(--accent) 4%, transparent)' : ri % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'

                return (
                  <tr key={id} style={{ background: rowBg, borderBottom: '1px solid var(--divider)' }}>
                    {/* Checkbox */}
                    <td style={{ padding: '6px 10px', textAlign: 'center', position: 'sticky', left: 0, background: rowBg }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(id)} style={{ cursor: 'pointer' }} />
                    </td>
                    {/* Action buttons */}
                    <td style={{ padding: '4px 8px', position: 'sticky', left: 36, background: rowBg }}>
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button onClick={saveRow} disabled={saving}
                            className="flex items-center gap-0.5 px-2 py-1 rounded text-white text-micro font-semibold"
                            style={{ background: saving ? '#999' : 'var(--accent-green)' }}>
                            <Save size={10} /> {saving ? '...' : 'บันทึก'}
                          </button>
                          <button onClick={cancelEdit}
                            className="px-1.5 py-1 rounded text-micro"
                            style={{ border: '1px solid var(--divider)', color: 'var(--text-3)' }}>
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(row)}
                          className="flex items-center gap-0.5 px-2 py-1 rounded text-micro"
                          style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                          {wasSaved ? <span className="text-success">✓ Saved</span> : <><Edit2 size={10} /> แก้ไข</>}
                        </button>
                      )}
                    </td>
                    {/* Data cells */}
                    {tableDef.cols.map(col => (
                      <td key={col.key}
                        style={{ padding: '4px 10px', maxWidth: col.width || 120, overflow: 'hidden', color: 'var(--text-1)', verticalAlign: 'middle' }}>
                        {isEditing && col.type !== 'readonly' ? (
                          <CellInput col={col} value={editValues[col.key]} onChange={v => setEditValues(prev => ({ ...prev, [col.key]: v }))} />
                        ) : (
                          <CellDisplay col={col} value={row[col.key]} />
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>}

      {/* Footer */}
      {!isReconcile && <div className="flex-shrink-0 px-5 pb-3 flex items-center gap-3">
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          {filtered.length} แถว {rows.length !== filtered.length ? `(กรองจาก ${rows.length})` : ''} · แสดงสูงสุด 500 แถว
        </p>
        {selectedIds.size > 0 && (
          <p className="text-xs text-indigo-400 font-semibold">{selectedIds.size} แถวที่เลือก</p>
        )}
      </div>}

      {bulkModal && (
        <BulkEditModal
          cols={tableDef.cols}
          count={selectedIds.size}
          onApply={applyBulkEdit}
          onClose={() => setBulkModal(false)} />
      )}
    </div>
  )
}
