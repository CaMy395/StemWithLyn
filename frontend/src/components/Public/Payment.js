import React from "react";
import { useSearchParams } from "react-router-dom";
import "../../App.css";
import { useLocation } from 'react-router-dom';


const PaymentPage = () => {
    const [searchParams] = useSearchParams();
    const location = useLocation();

    const recipient = "caitlyn.myland@aol.com";  // Zelle recipient
    const zelleQR = "/zelle-qr.png";  
    const cashAppQR = "/CashappQR.png";
    
    // ✅ Extract parameters from URL
    const price = parseFloat(searchParams.get("price")) || "0.00";  // ✅ Use `price` instead of `basePrice`
    const rawAppointmentType = searchParams.get("appointment_type") || "Appointment";  
    const appointmentType = decodeURIComponent(rawAppointmentType);  // Decode special characters

    // ✅ Extract Add-ons from URL and State
    let addons = [];

    // Try extracting from URL
    const rawAddons = searchParams.get("addons");
    if (rawAddons) {
        try {
            const decodedString = atob(decodeURIComponent(rawAddons));
            addons = JSON.parse(decodedString);
        } catch (error) {
            console.error("❌ Error parsing add-ons:", error);
            addons = [];
        }
    }

    // Fallback: Extract from React Router state
    if (addons.length === 0 && location.state?.addons) {
        console.log("🔄 Using add-ons from state instead of URL");
        addons = location.state.addons;
    }

    console.log("📥 Final Add-ons in Payment Page:", addons);



    // ✅ Function to calculate total price
    const getTotalPrice = (baseAmount, addons) => {
        let total = parseFloat(baseAmount);
    
        console.log("📊 Base Amount:", total);
        console.log("🛠️ Add-ons being calculated:", addons);
    
        addons.forEach(addon => {
            if (addon.price) {  
                total += (addon.price * (addon.quantity || 1)); // Multiply by quantity
            }
        });
    
        console.log("💰 Final Calculated Price:", total.toFixed(2));
    
        return total.toFixed(2);
    };
    

    const finalAmount = getTotalPrice(price, addons);


    return (
        <div style={styles.container}>
            <h2 className="payment-title">Zelle & CashApp Payment Instructions</h2>
            <p style={styles.text}>To complete your payment, please follow these steps:</p>
    
            {/* ✅ Show selected add-ons if they exist */}
            {addons.length > 0 && (
                <div style={styles.addonSection}>
                    <h3>Selected Add-ons:</h3>
                    <ul>
                {addons.map((addon, index) => (
                    <li key={index}>{addon.name} (x{addon.quantity}) - ${addon.price.toFixed(2)} each</li>
                ))}
            </ul>

                </div>
            )}

            {/*<p><strong>Total Payment Amount:</strong> ${parseFloat(price) + addons.reduce((sum, addon) => sum + addon.price, 0)}</p>*/}

    
            <div style={styles.paymentContainer}>
                {/* ✅ Zelle Payment Section */}
                <div style={styles.paymentBox}>
                    <h3>Zelle Payment</h3>
                    <p>Send <strong>${finalAmount}</strong> to <strong>{recipient}</strong> or scan QR below</p>
                    <p>Add to memo: <strong>Payment for {appointmentType}</strong></p>
    
                    {/* ✅ Show add-ons in memo if they exist */}
                    {addons.length > 0 && (
                        <p style={styles.memo}>
                            <strong>Including Add-ons:</strong> {addons.map(addon => addon.name).join(", ")}
                        </p>
                    )}
    
                    <img src={zelleQR} alt="Zelle QR Code" style={styles.qrCode} />
                </div>
                
                {/* ✅ CashApp Payment Section */}
                <div style={styles.paymentBox}>
                    <h3>CashApp Payment</h3>
                    <p>Scan the QR code below or send <strong>${finalAmount}</strong> to <strong>$readybartending</strong></p>
                    <p>Add to memo: <strong>Payment for {appointmentType}</strong></p>
    
                    {/* ✅ Show add-ons in memo if they exist */}
                    {addons.length > 0 && (
                        <p style={styles.memo}>
                            <strong>Including Add-ons:</strong> {addons.map(addon => addon.name).join(", ")}
                        </p>
                    )}
    
                    <img src={cashAppQR} alt="CashApp QR Code" style={styles.qrCode} />
                </div>
            </div>
    
            <p style={styles.note}><strong>Note:</strong> Payments via Zelle and CashApp are instant and cannot be reversed.</p>
        </div>
    );
}    

// ✅ Inline Styles
const styles = {
    container: {
        maxWidth: "600px",
        margin: "40px auto",
        padding: "20px",
        borderRadius: "10px",
        boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.1)",
        backgroundColor: "#fff",
        textAlign: "center",
    },
    text: {
        fontSize: "16px",
        color: "#333",
    },
    paymentContainer: {
        display: "flex",
        justifyContent: "space-around",
        flexWrap: "wrap",
        marginTop: "20px",
    },
    paymentBox: {
        border: "1px solid #ccc",
        borderRadius: "10px",
        padding: "15px",
        width: "45%",
        textAlign: "center",
    },
    qrCode: {
        width: "150px",
        height: "150px",
        marginTop: "10px",
    },
    note: {
        marginTop: "20px",
        fontSize: "14px",
        color: "#666",
    },
};

export default PaymentPage;
