import { publishEvent } from "../events"
import {
  Event,
  RowsImportedEvent,
  RowsCreatedEvent,
  RowImportFormat,
  Table,
} from "@budibase/types"

/* eslint-disable */

export const created = async (count: number) => {
  const properties: RowsCreatedEvent = {
    count,
  }
  await publishEvent(Event.ROWS_CREATED, properties)
}

export const imported = async (
  table: Table,
  format: RowImportFormat,
  count: number
) => {
  const properties: RowsImportedEvent = {}
  await publishEvent(Event.ROWS_IMPORTED, properties)
}