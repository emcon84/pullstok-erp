import jwt from 'jsonwebtoken';

export const generateToken = (userId: string, isAdmin: boolean) => {
    return jwt.sign({ id: userId, isAdmin }, process.env.JWT_SECRET as string, {
        expiresIn: '1h',
    });
};
