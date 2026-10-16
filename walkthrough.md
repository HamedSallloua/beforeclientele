# Walkthrough — Admin Orders Table with Correct Details Expansion Placement

Fixed the **Details expansion placement** in the Admin Orders table so that each expanded details/history section renders **immediately underneath its exact parent order row**.

---

## Changes

### `AdminOrders.jsx`
- Imported `Fragment` from `react`.
- Wrapped each order row and its corresponding details row together inside `<Fragment key={order.id}>` in `<tbody>`:
  ```jsx
  {paginatedOrders.map((order) => {
    const isExpanded = expandedOrderIds.includes(order.id);
    return (
      <Fragment key={order.id}>
        <tr className="admin-order-row" id={`order-${order.id}`}>
          {/* Main 8 columns */}
        </tr>
        {isExpanded && (
          <tr className="admin-order-expanded-row">
            <td colSpan={8} className="admin-order-expanded-cell">
              {/* Details and historical exchanges/refunds */}
            </td>
          </tr>
        )}
      </Fragment>
    );
  })}
  ```
- Guaranteed that multiple orders can be expanded at once, and each expanded section stays directly below its parent row while scrolling vertically through the table.

---

## Verification

1. **Safeguards & Table Logic Test Suite**:
   - `node server/scripts/test_admin_orders_table_safeguards.js` passed all 9 test suites.
2. **PDF Selection & Print Test Suite**:
   - `node server/scripts/test_admin_orders_pdf_selection.js` passed all 9 scenarios.
3. **Production Build**:
   - `npm run build` compiled without errors.
