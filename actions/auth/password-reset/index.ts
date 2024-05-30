"use server"

import { NewPasswordSchema, ResetPasswordSchema } from "@/schemas/auth"
import {
	createResetPasswordToken,
	deleteResetPasswordToken,
	findResetPasswordTokenByToken,
	updatePassword,
} from "@/services/auth"
import { findUserbyEmail } from "@/services"
import bcryptjs from "bcryptjs"
import { Resend } from "resend"
import type { z } from "zod"
/**
 * This method initiates the reset password process
 * @param values
 * @returns
 */
export const resetPassword = async (values: z.infer<typeof ResetPasswordSchema>) => {
	const validatedEmail = ResetPasswordSchema.safeParse(values)
	if (!validatedEmail.success) {
		return { error: "E-mail inválido" }
	}

	const { email } = validatedEmail.data

	const existingUser = await findUserbyEmail(email)
	if (!existingUser) {
		return { error: "Usuário não encontrado" }
	}

	const resetPasswordToken = await createResetPasswordToken(email)
	await sendResetPasswordEmail(resetPasswordToken.email, resetPasswordToken.token)

	return { success: "E-mail de mudança de senha enviado" }
}

/**
 * This method uses Resend to send an e-mail to change the user's password
 * @param { User } user
 * @param { string } token
 * @returns it returns an object
 * { error: string, success: string } or
 * throw an error
 */
export const sendResetPasswordEmail = async (email: string, token: string) => {
	const resend = new Resend(process.env.RESEND_API_KEY)

	const { NEXT_PUBLIC_URL, RESEND_EMAIL_FROM, RESET_PASSWORD_SUBJECT, RESET_PASSWORD_URL } = process.env
	const resetUrl = `${NEXT_PUBLIC_URL}${RESET_PASSWORD_URL}?token=${token}`
	const { data, error } = await resend.emails.send({
		from: RESEND_EMAIL_FROM,
		to: email,
		subject: RESET_PASSWORD_SUBJECT,
		html: `<p>Clique <a href="${resetUrl}">aqui</a> para modificar sua senha.</p>`,
	})

	if (error)
		return {
			error,
		}
	return {
		success: "E-mail enviado com sucesso",
	}
}

/**
 * This method updates the user's password
 * @param { string } passwordData - Changed hashed password
 * @param { string } token
 * @returns
 */
export const changePassword = async (passwordData: z.infer<typeof NewPasswordSchema>, token: string | null) => {
	if (!token) {
		return { error: "Token não encontrado" }
	}

	const validatedPassword = NewPasswordSchema.safeParse(passwordData)

	if (!validatedPassword.success) {
		return { error: "Valores inválidos" }
	}

	const { password } = validatedPassword.data

	const existingToken = await findResetPasswordTokenByToken(token)
	if (!existingToken) {
		return { error: "Token inválido" }
	}

	const hasExpired = new Date(existingToken.expires) < new Date()
	if (hasExpired) {
		return { error: "Token Expirado" }
	}

	const existingUser = await findUserbyEmail(existingToken.email)
	if (!existingUser) {
		return { error: "Usuário não encontrado" }
	}

	const hashedPassword = await bcryptjs.hash(password, 10)

	await updatePassword(existingUser.id, hashedPassword)

	await deleteResetPasswordToken(existingToken.id)

	return { success: "Senha atualizada" }
}
