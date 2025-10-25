import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Player, PlayerDocument } from 'src/player/player.schema';
import { QuestionHistory, QuestionHistoryDocument } from 'src/question/question-history.schema';

export interface UpsertAnswerResult {
	created: boolean;
	score: number;
}

@Injectable()
export class PlayerService {
	private readonly logger = new Logger(PlayerService.name);
	constructor(
		@InjectModel(Player.name) private playerModel: Model<PlayerDocument>,
		@InjectModel(QuestionHistory.name) private questionHistoryModel: Model<QuestionHistoryDocument>,
	) { }

	async findOrCreatePlayer(telegramId: number, username?: string) {
		const existing = await this.playerModel.findOne({ telegramId }).exec();
		if (existing) return existing;
		const created = await this.playerModel.create({ telegramId, username });
		return created;
	}

	async findPlayerByTelegramId(telegramId: number, username?: string) {
		return await this.playerModel.findOne({ telegramId }).exec();
	}

	async getTopPlayers(limit = 5) {
		const pipeline = [
			{ $match: { isDeleted: false, playerId: { $exists: true, $ne: null } } }, // Only answered questions
			{ $group: { _id: '$playerId', totalScore: { $sum: '$score' } } },
			{ $sort: { totalScore: -1 } },
			{ $limit: limit },
			{
				$lookup: {
					from: 'players',
					localField: '_id',
					foreignField: '_id',
					as: 'player'
				}
			},
			{ $unwind: '$player' },
			{ $project: { playerId: '$_id', totalScore: 1, username: '$player.username', telegramId: '$player.telegramId' } }
		];

		const res = await this.questionHistoryModel.aggregate(pipeline as any).exec();
		return res as Array<{ playerId: string; totalScore: number; username?: string; telegramId?: number }>;
	}

	async recordUnansweredQuestion(questionId: string): Promise<QuestionHistory> {
		try {
			const questionHistory = await this.questionHistoryModel.create({
				question: questionId,
				playerId: null,
				score: 0,
				isDeleted: false
			});
			return questionHistory;
		} catch (err) {
			this.logger.error('Failed to record unanswered question', err);
			throw err;
		}
	}

	async getQuestionStats(questionId: string) {
		const pipeline = [
			{ $match: { question: questionId, isDeleted: false } },
			{
				$group: {
					_id: { answered: { $ne: ['$playerId', null] } },
					count: { $sum: 1 }
				}
			}
		];

		const stats = await this.questionHistoryModel.aggregate(pipeline).exec();

		let answered = 0;
		let unanswered = 0;

		stats.forEach(stat => {
			if (stat._id.answered) {
				answered = stat.count;
			} else {
				unanswered = stat.count;
			}
		});

		return {
			totalAsked: answered + unanswered,
			answered,
			unanswered,
			answerRate: answered + unanswered > 0 ? (answered / (answered + unanswered)) * 100 : 0
		};
	}

	public async getTotalPlayers(): Promise<number> {
		return this.playerModel.countDocuments({ isDeleted: false }).exec();
	}
}
