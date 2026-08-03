cp src/routes/exam.routes.ts src/controllers/exam.validate.ts
cp src/routes/exam.routes.ts src/controllers/exam.shuffle.ts

# For validate: keep 1-143, delete 144 to end
sed -i '144,$d' src/controllers/exam.validate.ts
echo '});' >> src/controllers/exam.validate.ts

# For shuffle: keep 1-21, and 144 to end
sed -i '22,143d' src/controllers/exam.shuffle.ts

# Now modify the actual code in the files
sed -i 's/examRouter.post('\''\/validate'\'', validateLimiter, upload.single('\''file'\''), async (req, res) => {/export const validateExam = async (req: Request, res: Response) => {/g' src/controllers/exam.validate.ts
sed -i '/export const examRouter = Router();/d' src/controllers/exam.validate.ts

sed -i 's/examRouter.post('\''\/shuffle'\'', shuffleLimiter, upload.single('\''file'\''), async (req, res) => {/export const shuffleExam = async (req: Request, res: Response) => {/g' src/controllers/exam.shuffle.ts
sed -i '/export const examRouter = Router();/d' src/controllers/exam.shuffle.ts

