import mongoose from 'mongoose';
import Receipt from './src/models/receiptModel'; // Ajusta el path según tu estructura

// Conectar a MongoDB
mongoose.connect('mongodb://localhost/nexo');

const createReceipt = async () => {
    try {
        const receipt = new Receipt({
            type: 'invoice',
            relatedDocument: new mongoose.Types.ObjectId() // Puedes usar un ID real de presupuesto aquí si ya tienes uno
        });
        await receipt.save();
        console.log('Receipt created:', receipt);
    } catch (error) {
        console.error('Error creating receipt:', error);
    } finally {
        mongoose.connection.close();
    }
};

createReceipt();

